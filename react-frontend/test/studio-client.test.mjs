import test from "node:test";
import assert from "node:assert/strict";
import { AuthClient } from "../src/lib/api-auth.ts";
import {
  loadIndexedCatalog,
  mergeIndexedCatalog,
} from "../src/lib/indexed-catalog.ts";
import { safeContentUrl, purchaseCost } from "../src/lib/marketplace.js";
import { fixture, chain, codeHash, rpcListing } from "./api.fixture.mjs";
import { studioDemo } from "../src/data/studio-demo.js";
const org = "11111111-1111-4111-8111-111111111111",
  record = "22222222-2222-4222-8222-222222222222",
  asset = "33333333-3333-4333-8333-333333333333";
const settings = {
  baseUrl: "http://127.0.0.1:3001",
  timeoutMs: 1000,
  maxAgeMs: 30000,
  pollMs: 15000,
};
test("Studio mutations use session credentials, CSRF, fixed tenant paths and explicit publication confirmation", async () => {
  const calls = [];
  const client = new AuthClient(
    settings,
    "http://127.0.0.1:5173",
    async (url, options) => {
      calls.push({ url, options });
      return Response.json(
        url.endsWith("/me")
          ? {
              authenticated: true,
              user: { id: org, displayName: null, platformRole: "investor" },
              wallet: {
                address: "0x" + "1".repeat(40),
                chainId: "31337",
                kind: "EOA",
              },
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              csrfToken: "x".repeat(43),
            }
          : url.endsWith("/publish")
            ? { published: true }
            : url.endsWith("/archive")
              ? { archived: true }
              : url.endsWith("/association")
                ? { associated: true }
                : { id: record },
      );
    },
  );
  await client.me();
  await client.studioCreate(org, studioDemo);
  await client.studioPublish(org, record, 3);
  await client.studioArchive(org, record);
  await client.studioAssociate(org, record, asset);
  for (const call of calls.slice(1)) {
    assert.equal(call.options.credentials, "include");
    assert.equal(call.options.headers["X-CSRF-Token"], "x".repeat(43));
    assert.ok(call.url.includes("/organizations/" + org + "/studio/"));
  }
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    expectedRevision: 3,
    confirmPublication: true,
  });
  assert.deepEqual(JSON.parse(calls[3].options.body), { confirmArchive: true });
  assert.throws(
    () => client.studioAssociate(org, record, "../escape"),
    (e) => e.code === "query",
  );
  assert.equal("tokenPriceWei" in studioDemo, false);
});
test("Studio client propagates bounded validation/conflict messages and fetches private files as credentialed blobs", async () => {
  const client = new AuthClient(
    settings,
    "http://127.0.0.1:5173",
    async (url, opt) => {
      assert.equal(opt.credentials, "include");
      return new Response("private document", {
        headers: { "Content-Type": "text/plain" },
      });
    },
  );
  assert.equal(
    await (await client.studioAsset(org, record, asset)).text(),
    "private document",
  );
  const bad = new AuthClient(settings, "http://127.0.0.1:5173", async () =>
    Response.json(
      {
        error: {
          message: "Draft changed in another tab; reload before editing",
        },
      },
      { status: 409 },
    ),
  );
  await assert.rejects(
    bad.studioPublish(org, record, 1),
    (e) => e.status === 409 && e.message.includes("reload"),
  );
});
test("published local media resolves only to the configured API and never changes chain financial values", async () => {
  const f = fixture();
  for (const a of f.rows[0].metadata.assets) {
    a.availability = "local_published";
    a.url = "/api/v1/media/" + a.id;
  }
  f.rows[0].metadata.characteristics = { bedrooms: 3 };
  const catalog = await loadIndexedCatalog({
    client: f.client,
    chain,
    rpc: f.rpc,
    codeHash,
  });
  const listing = rpcListing();
  const [merged] = mergeIndexedCatalog([listing], catalog, 30000);
  assert.match(merged.image, /^http:\/\/127\.0\.0\.1:3001\/api\/v1\/media\//);
  assert.equal(safeContentUrl(merged.image), merged.image);
  assert.equal(merged.characteristics.bedrooms, 3);
  assert.equal(purchaseCost(merged, "3").toString(), "30000000000000000");
  assert.equal(merged.available, listing.available);
  assert.equal(merged.mine, listing.mine);
  for (const url of [
    "http://evil.example/a.png",
    "http://127.0.0.1:3001/api/v1/me",
    "http://127.0.0.1:3001/api/v1/media/" + asset + "?secret=x",
    "javascript:alert(1)",
  ])
    assert.equal(safeContentUrl(url), null);
  const unsafe = fixture();
  unsafe.rows[0].metadata.assets[0].availability = "local_published";
  unsafe.rows[0].metadata.assets[0].url = "http://evil.example/file";
  await assert.rejects(
    unsafe.client.property(unsafe.rows[0].id),
    /incompatible response/,
  );
});
