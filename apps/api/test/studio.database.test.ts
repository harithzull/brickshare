import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { Wallet, getCreateAddress, Interface } from "ethers";
import sharp from "sharp";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { createDataSource } from "../src/database/data-source";
import { validateEnvironment } from "../src/config/environment";
import { JsonLogger } from "../src/common/json-logger";
import { configureHttp } from "../src/common/http";
import { digest, secret, sessionCsrf } from "../src/auth/security";
import { FakeChain } from "./indexer.fixture";
import { IndexingWorker } from "../src/indexer/worker";
import { indexerSettings } from "../src/indexer/config";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL must identify a dedicated database ending in _test.",
  );
const content = {
  title: "FICTIONAL Cedar Residence",
  location: "Fictional City",
  description: "A clearly fictional local demonstration property.",
  characteristics: { propertyType: "house", bedrooms: 3, areaSqm: 120 },
};
async function fixture(run: (f: any) => Promise<void>) {
  const schema = "test_" + randomUUID().replace(/-/g, "");
  const storage = await mkdtemp(join(tmpdir(), "brickshare-studio-db-"));
  let app: any;
  const ownerWallet = Wallet.createRandom();
  const chain = new FakeChain();
  chain.target.deployer = ownerWallet.address.toLowerCase();
  chain.target.address = getCreateAddress({
    from: ownerWallet.address,
    nonce: 0,
  }).toLowerCase();
  const abi = new Interface(["function owner() view returns(address)"]);
  const rpc = {
    async request<T = unknown>(method: string, args: any[]): Promise<T> {
      let result: any = await chain.request(method, args);
      if (method === "eth_getTransactionReceipt" && result)
        result = { ...result, from: chain.target.deployer };
      if (method === "eth_getTransactionByHash")
        result = { ...result, from: chain.target.deployer };
      if (
        method === "eth_call" &&
        args[0].data === abi.encodeFunctionData("owner")
      )
        result = abi.encodeFunctionResult("owner", [chain.target.deployer]);
      return result as T;
    },
  };
  const rpcServer = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const call = JSON.parse(body);
    try {
      const result = await rpc.request(call.method, call.params);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, result }));
    } catch {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: call.id,
          error: { code: -32000, message: "test RPC failure" },
        }),
      );
    }
  });
  rpcServer.listen(0, "127.0.0.1");
  await once(rpcServer, "listening");
  const port = (rpcServer.address() as any).port;
  const env = validateEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: url,
    DATABASE_SCHEMA: schema,
    STUDIO_STORAGE_DIR: storage,
    STUDIO_RPC_URL: `http://127.0.0.1:${port}`,
  });
  const source = createDataSource(env);
  const logger = new JsonLogger(() => undefined);
  try {
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    const module = await Test.createTestingModule({
      imports: [AppModule.register(env as unknown as Record<string, unknown>)],
    })
      .overrideProvider(DataSource)
      .useValue(source)
      .overrideProvider(JsonLogger)
      .useValue(logger)
      .compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    configureHttp(app, env, logger);
    await app.init();
    const server = app.getHttpServer();
    const user = async (wallet = Wallet.createRandom()) => {
      const [{ id }] = await source.query(
        "INSERT INTO users DEFAULT VALUES RETURNING id",
      );
      const [w] = await source.query(
        "INSERT INTO wallet_identities(user_id,address,verified_at) VALUES($1,$2,now()) RETURNING id",
        [id, Buffer.from(wallet.address.slice(2), "hex")],
      );
      const token = secret(),
        csrf = sessionCsrf(token);
      await source.query(
        "INSERT INTO sessions(user_id,wallet_id,token_hash,csrf_hash,chain_id,origin,expires_at) VALUES($1,$2,$3,$4,31337,$5,now()+interval '1 hour')",
        [id, w.id, digest(token), digest(csrf), env.AUTH_ORIGIN],
      );
      return { id, wallet, csrf, cookie: "brickshare_session=" + token };
    };
    const owner = await user(ownerWallet);
    const editor = await user();
    const viewer = await user();
    const stranger = await user();
    const mutate = (u: any, path: string, body: any = {}, method = "post") =>
      request(server)
        [method as "post"](path)
        .set("Cookie", u.cookie)
        .set("Origin", env.AUTH_ORIGIN)
        .set("X-BrickShare-Auth", "1")
        .set("X-CSRF-Token", u.csrf)
        .send(body);
    const get = (u: any, path: string) =>
      request(server)
        .get(path)
        .set("Cookie", u.cookie)
        .set("Origin", env.AUTH_ORIGIN);
    const org = (
      await mutate(owner, "/api/v1/organizations", {
        name: "FICTIONAL Cedar Studio",
      }).expect(201)
    ).body.data.id;
    for (const [u, role] of [
      [editor, "editor"],
      [viewer, "viewer"],
    ])
      await source.query(
        "INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3)",
        [org, (u as any).id, role],
      );
    const base = `/api/v1/organizations/${org}/studio/records`;
    const create = async (u = editor) =>
      (await mutate(u, base, content).expect(201)).body.id;
    const detail = async (id: string, u = owner) =>
      (await get(u, base + "/" + id).expect(200)).body.data;
    const index = async () => {
      chain.addBlock([
        [
          "PropertyCreated",
          [1n, "Indexed property", "Local", 1000n, 10000000000000001n],
        ],
      ]);
      const worker = new IndexingWorker(
        source,
        rpc,
        indexerSettings({}),
        chain.target,
        logger,
      );
      for (let i = 0; i < 10; i++)
        if ((await worker.tick()) === "synced") break;
      return (
        await source.query("SELECT id FROM properties WHERE canonical_snapshot")
      )[0].id;
    };
    await run({
      source,
      env,
      storage,
      server,
      owner,
      editor,
      viewer,
      stranger,
      mutate,
      get,
      org,
      base,
      create,
      detail,
      index,
      chain,
    });
  } finally {
    await app?.close();
    if (!source.isInitialized) await source.initialize();
    assert.match(schema, /^test_[a-f0-9]{32}$/);
    await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await source.destroy();
    await new Promise<void>((resolve, reject) =>
      rpcServer.close((e) => (e ? reject(e) : resolve())),
    );
    assert.equal(resolve(storage, ".."), resolve(tmpdir()));
    await rm(storage, { recursive: true, force: true });
  }
}

test("Studio migration is reversible before projection, preserves catalog and enforces composite tenant FKs", async () =>
  fixture(async (f: any) => {
    await f.source.undoLastMigration();
    await request(f.server).get('/api/v1/media/' + randomUUID()).expect(503);
    await f.source.query(
      `INSERT INTO properties(source,fixture_label) VALUES('fictional','preserved')`,
    );
    assert.equal((await f.source.runMigrations()).length, 1);
    assert.equal(
      (await f.source.query("SELECT fixture_label FROM properties"))[0]
        .fixture_label,
      "preserved",
    );
    const id = await f.create();
    const d = await f.detail(id);
    await assert.rejects(
      f.source.query(
        "INSERT INTO studio_version_assets(version_id,asset_id,record_id,organization_id,purpose,display_order) VALUES($1,$2,$3,$4,'hero',0)",
        [d.versions[0].id, randomUUID(), id, randomUUID()],
      ),
      (e: any) => e.driverError?.code === "23503",
    );
    await assert.rejects(
      f.source.query(
        "UPDATE studio_records SET organization_id=$2 WHERE id=$1",
        [id, randomUUID()],
      ),
      (e: any) => e.driverError?.code === "23514",
    );
  }));
test("backend roles, cross-organization IDs, mass assignment and CSRF protect every Studio write", async () =>
  fixture(async (f: any) => {
    const id = await f.create();
    assert.equal(
      (await f.get(f.viewer, f.base)).body.permissions.canEdit,
      false,
    );
    await f.get(f.viewer, f.base + "/" + id).expect(200);
    await f.get(f.stranger, f.base).expect(404);
    await f.get(f.stranger, f.base + "/" + id).expect(404);
    await request(f.server).get(f.base).expect(401);
    for (const [suffix, body, method] of [
      ["", content, "post"],
      [
        "/" + id + "/draft",
        { ...content, expectedRevision: 1, assets: [] },
        "patch",
      ],
      [
        "/" + id + "/publish",
        { expectedRevision: 1, confirmPublication: true },
        "post",
      ],
      ["/" + id + "/archive", { confirmArchive: true }, "post"],
      ["/" + id + "/association", { propertyId: randomUUID() }, "post"],
      [
        "/" + id + "/assets",
        { name: "test.txt", mimeType: "text/plain", base64: "dGVzdA==" },
        "post",
      ],
    ])
      await f.mutate(f.viewer, f.base + suffix, body, method).expect(403);
    await f
      .mutate(f.editor, f.base + "/" + id + "/publish", {
        expectedRevision: 1,
        confirmPublication: true,
      })
      .expect(403);
    await f
      .mutate(f.editor, f.base + "/" + id + "/association", {
        propertyId: randomUUID(),
      })
      .expect(403);
    await f
      .mutate(f.editor, f.base, { ...content, organizationId: randomUUID() })
      .expect(400);
    await f
      .mutate(
        f.editor,
        f.base + "/" + id + "/draft",
        { ...content, expectedRevision: 1, assets: [], tokenPriceWei: "1" },
        "patch",
      )
      .expect(400);
    await request(f.server)
      .post(f.base)
      .set("Cookie", f.owner.cookie)
      .set("Origin", f.env.AUTH_ORIGIN)
      .set("X-BrickShare-Auth", "1")
      .send(content)
      .expect(403);
    const otherOrg = (
      await f.mutate(f.stranger, "/api/v1/organizations", {
        name: "FICTIONAL other",
      })
    ).body.data.id;
    await f
      .get(f.stranger, `/api/v1/organizations/${otherOrg}/studio/records/${id}`)
      .expect(404);
  }));
test("fictional workflow has optimistic concurrency, explicit publication, immutable history, archive and revision recovery", async () =>
  fixture(async (f: any) => {
    const id = await f.create();
    const path = f.base + "/" + id;
    const edited = {
      ...content,
      description: "Revised fictional description",
      expectedRevision: 1,
      assets: [],
    };
    const results = await Promise.all([
      f.mutate(f.editor, path + "/draft", edited, "patch"),
      f.mutate(f.editor, path + "/draft", edited, "patch"),
    ]);
    assert.deepEqual(results.map((r: any) => r.status).sort(), [200, 409]);
    await f
      .mutate(f.owner, path + "/publish", {
        expectedRevision: 2,
        confirmPublication: false,
      })
      .expect(400);
    await f
      .mutate(f.owner, path + "/publish", {
        expectedRevision: 1,
        confirmPublication: true,
      })
      .expect(409);
    const published = await f
      .mutate(f.owner, path + "/publish", {
        expectedRevision: 2,
        confirmPublication: true,
      })
      .expect(201);
    assert.equal(published.body.publicCatalog, false);
    assert.equal(
      (
        await f.source.query("SELECT count(*) FROM property_metadata_versions")
      )[0].count,
      "0",
    );
    await f
      .mutate(
        f.editor,
        path + "/draft",
        { ...edited, expectedRevision: 2 },
        "patch",
      )
      .expect(409);
    await assert.rejects(
      f.source.query(
        "UPDATE studio_versions SET description='tampered' WHERE record_id=$1",
        [id],
      ),
      (e: any) => e.driverError?.code === "23514",
    );
    await f.mutate(f.editor, path + "/revisions").expect(201);
    const before = await f.detail(id);
    assert.equal(before.versions.length, 2);
    assert.equal(
      before.versions[0].description,
      "Revised fictional description",
    );
    await f
      .mutate(f.owner, path + "/archive", { confirmArchive: true })
      .expect(201);
    assert.equal((await f.detail(id)).archived, true);
    await f.mutate(f.editor, path + "/revisions").expect(201);
    assert.equal((await f.detail(id)).versions[0].version, 3);
    await assert.rejects(
      f.source.query("DELETE FROM studio_audit_logs"),
      (e: any) => e.driverError?.code === "42501",
    );
  }));
test("uploads remain tenant-private, reject corrupt/oversized inputs and detect disk tampering", async () =>
  fixture(async (f: any) => {
    const id = await f.create();
    const path = f.base + "/" + id;
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#129078" },
    })
      .png()
      .toBuffer();
    const uploaded = (
      await f
        .mutate(f.editor, path + "/assets", {
          name: "fictional.png",
          mimeType: "image/png",
          base64: png.toString("base64"),
        })
        .expect(201)
    ).body.id;
    const doc = (
      await f
        .mutate(f.editor, path + "/assets", {
          name: "fictional.txt",
          mimeType: "text/plain",
          base64: Buffer.from("FICTIONAL test document").toString("base64"),
        })
        .expect(201)
    ).body.id;
    const image = await f
      .get(f.viewer, path + "/assets/" + uploaded)
      .expect(200);
    assert.match(image.headers["content-type"], /image\/webp/);
    assert.equal(image.headers["cache-control"], "no-store");
    const downloaded = await f
      .get(f.viewer, path + "/assets/" + doc)
      .expect(200);
    assert.match(downloaded.headers["content-disposition"], /^attachment/);
    assert.match(downloaded.headers["content-security-policy"], /sandbox/);
    await f.get(f.stranger, path + "/assets/" + uploaded).expect(404);
    await request(f.server)
      .get("/api/v1/media/" + uploaded)
      .expect(404);
    const second = await f.create();
    await f
      .mutate(
        f.editor,
        f.base + "/" + second + "/draft",
        {
          ...content,
          expectedRevision: 1,
          assets: [
            {
              assetId: uploaded,
              purpose: "hero",
              altText: "Safe image",
              caption: "",
            },
          ],
        },
        "patch",
      )
      .expect(404);
    await f
      .mutate(f.editor, path + "/assets", {
        name: "fake.png",
        mimeType: "image/png",
        base64: Buffer.from("<script>bad</script>").toString("base64"),
      })
      .expect(400);
    await f
      .mutate(f.editor, path + "/assets", {
        name: "large.txt",
        mimeType: "text/plain",
        base64: Buffer.alloc(1048577, 65).toString("base64"),
      })
      .expect(400);
    await f
      .mutate(f.editor, path + "/assets", {
        name: "huge.txt",
        mimeType: "text/plain",
        base64: "x".repeat(1600000),
      })
      .expect(413);
    const [asset] = await f.source.query(
      "SELECT storage_key FROM studio_assets WHERE id=$1",
      [uploaded],
    );
    await writeFile(join(f.storage, asset.storage_key), "tampered");
    await f.get(f.owner, path + "/assets/" + uploaded).expect(503);
    assert.equal((await readdir(f.storage)).length, 2);
  }));
test("verified association, publication, local public assets, immutable snapshots and reset safety integrate with the indexer", async () =>
  fixture(async (f: any) => {
    const propertyId = await f.index();
    const id = await f.create();
    const path = f.base + "/" + id;
    const candidates = `/api/v1/organizations/${f.org}/studio/candidates`;
    assert.equal(
      (await f.get(f.owner, candidates).expect(200)).body.data[0].propertyId,
      propertyId,
    );
    await f.get(f.editor, candidates).expect(403);
    // Owner of a different organization cannot claim a deployment through an off-chain role.
    const otherOrg = (
      await f.mutate(f.stranger, "/api/v1/organizations", {
        name: "FICTIONAL malicious",
      })
    ).body.data.id;
    const otherBase = `/api/v1/organizations/${otherOrg}/studio/records`;
    const otherId = (await f.mutate(f.stranger, otherBase, content)).body.id;
    await f
      .mutate(f.stranger, otherBase + "/" + otherId + "/association", {
        propertyId,
      })
      .expect(403);
    await f
      .mutate(f.owner, path + "/association", { propertyId: randomUUID() })
      .expect(409);
    await f.mutate(f.owner, path + "/association", { propertyId }).expect(201);
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#128268" },
    })
      .png()
      .toBuffer();
    const asset = (
      await f.mutate(f.editor, path + "/assets", {
        name: "house.png",
        mimeType: "image/png",
        base64: png.toString("base64"),
      })
    ).body.id;
    await f
      .mutate(
        f.editor,
        path + "/draft",
        {
          ...content,
          expectedRevision: 1,
          assets: [
            {
              assetId: asset,
              purpose: "hero",
              altText: "Fictional residence",
              caption: "Demo image",
            },
          ],
        },
        "patch",
      )
      .expect(200);
    await f
      .mutate(f.owner, path + "/publish", {
        expectedRevision: 2,
        confirmPublication: true,
      })
      .expect(201);
    const listing = (
      await request(f.server).get("/api/v1/properties/" + propertyId)
    ).body.data;
    assert.equal(listing.metadata.title, content.title);
    assert.equal(listing.metadata.characteristics.bedrooms, 3);
    assert.equal(listing.blockchain.tokenPriceWei, "10000000000000001");
    assert.equal(listing.metadata.assets[0].availability, "local_published");
    await request(f.server)
      .get("/api/v1/media/" + asset)
      .expect(200);
    await f.source.query(
      `UPDATE indexer_cursors SET last_success_at=now()-interval '1 hour'`,
    );
    await request(f.server)
      .get("/api/v1/media/" + asset)
      .expect(409);
    await f.source.query("UPDATE indexer_cursors SET last_success_at=now()");
    await request(f.server)
      .get("/api/v1/media/" + asset)
      .expect(200);
    f.chain.code = "0x6001";
    await request(f.server)
      .get("/api/v1/media/" + asset)
      .expect(409);
    f.chain.code = "0x6000";
    await assert.rejects(
      f.source.undoLastMigration(),
      /Studio has published catalog projections/,
    );
    await f.mutate(f.editor, path + "/revisions").expect(201);
    await f
      .mutate(
        f.editor,
        path + "/draft",
        {
          ...content,
          description: "Second published description",
          expectedRevision: 1,
          assets: [],
        },
        "patch",
      )
      .expect(200);
    await f
      .mutate(f.owner, path + "/publish", {
        expectedRevision: 2,
        confirmPublication: true,
      })
      .expect(201);
    await request(f.server)
      .get("/api/v1/media/" + asset)
      .expect(404);
    const history = await f.detail(id);
    assert.equal(history.versions[1].description, content.description);
    assert.equal(history.versions[1].state, "archived");
    await f.mutate(f.editor, path + "/revisions").expect(201);
    f.chain.runId = "0x" + "ff".repeat(32);
    await f
      .mutate(f.owner, path + "/publish", {
        expectedRevision: 1,
        confirmPublication: true,
      })
      .expect(409);
    await f
      .mutate(f.owner, path + "/archive", { confirmArchive: true })
      .expect(201);
    assert.equal(
      (await request(f.server).get("/api/v1/properties/" + propertyId)).body
        .data.metadata,
      null,
    );
  }));
test("stale/degraded observations and legacy metadata prevent association; stale public media fails closed", async () =>
  fixture(async (f: any) => {
    const propertyId = await f.index();
    const id = await f.create();
    const path = f.base + "/" + id;
    await f.source.query(
      `UPDATE indexer_cursors SET last_success_at=now()-interval '1 hour'`,
    );
    await f.mutate(f.owner, path + "/association", { propertyId }).expect(409);
    await f.source.query("UPDATE indexer_cursors SET last_success_at=now()");
    await f.source.query(
      `INSERT INTO property_metadata_versions(property_id,version,title) VALUES($1,1,'Legacy operator metadata')`,
      [propertyId],
    );
    await f.mutate(f.owner, path + "/association", { propertyId }).expect(409);
    assert.equal(
      (
        await f.source.query(
          "SELECT property_id FROM studio_records WHERE id=$1",
          [id],
        )
      )[0].property_id,
      null,
    );
  }));
