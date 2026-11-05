import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ContractFactory, Contract, JsonRpcProvider, keccak256 } from 'ethers';
import { apiRoot, validateEnvironment } from '../src/config/environment';
import { createDataSource } from '../src/database/data-source';
import { JsonLogger } from '../src/common/json-logger';
import { indexerSettings } from '../src/indexer/config';
import { loadTarget } from '../src/indexer/identity';
import { LocalRpc } from '../src/indexer/rpc';
import { IndexingWorker } from '../src/indexer/worker';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureHttp } from '../src/common/http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must identify a dedicated database ending in _test.');
const root = resolve(apiRoot, '../..');
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); return port;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill(); await exited;
}
test('full stack: real Hardhat, worker restart, Nest API, frontend metadata, reorg and reset', { timeout: 90000 }, async () => {
  const port = await freePort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  const schema = 'test_' + randomUUID().replace(/-/g, '');
  const temp = mkdtempSync(join(tmpdir(), 'brickshare-indexer-live-'));
  const source = createDataSource(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, DATABASE_SCHEMA: schema }));
  const node = spawn(process.execPath, [join(root, 'node_modules/hardhat/internal/cli/cli.js'), 'node', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, windowsHide: true, stdio: 'ignore', env: { ...process.env, DEPLOYER_PRIVATE_KEY: '', ETHERSCAN_API_KEY: '' } });
  const rpc = new LocalRpc(rpcUrl, 2000);
  let provider: JsonRpcProvider | undefined;
  let api: INestApplication | undefined;
  try {
    let started = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(node.exitCode, null, 'Isolated Hardhat process exited before startup');
      try { await rpc.request('hardhat_metadata', []); started = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(started, 'Isolated Hardhat RPC did not start');
    await source.initialize(); await source.query(`CREATE SCHEMA "${schema}"`); await source.runMigrations();
    provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
    const deployer = await provider.getSigner(0); const buyer = await provider.getSigner(1); const recipient = await provider.getSigner(2);
    const artifactPath = join(root, 'artifacts/contracts/RealEstateTokenization.sol/RealEstateTokenization.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    const manifestPath = join(temp, 'deployment.json');
    async function deploy() {
      const contract = await new ContractFactory(artifact.abi, artifact.bytecode, deployer).deploy();
      const receipt = await contract.deploymentTransaction()!.wait(); assert.ok(receipt);
      writeFileSync(manifestPath, JSON.stringify({ contractName: 'RealEstateTokenization', network: 'localhost', chainId: 31337, address: await contract.getAddress(), blockNumber: receipt.blockNumber, transactionHash: receipt.hash, deployer: await deployer.getAddress(), compilerVersion: '0.8.19', deployedBytecodeHash: keccak256(artifact.deployedBytecode) }));
      return new Contract(await contract.getAddress(), artifact.abi, deployer);
    }
    const contract = await deploy();
    const settings = indexerSettings({ INDEXER_RPC_URL: rpcUrl, INDEXER_DEPLOYMENT_FILE: manifestPath, INDEXER_ARTIFACT_FILE: artifactPath });
    const logger = new JsonLogger(() => undefined);
    const worker = () => new IndexingWorker(source, rpc, settings, loadTarget(settings), logger);
    const runProcess = async () => {
      const child = spawn(process.execPath, [join(apiRoot, 'dist/src/indexer/main.js'), '--once'], { cwd: apiRoot, windowsHide: true, stdio: 'ignore', env: {
        ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, DATABASE_SCHEMA: schema, DATABASE_SSL: 'false',
        INDEXER_RPC_URL: rpcUrl, INDEXER_DEPLOYMENT_FILE: manifestPath, INDEXER_ARTIFACT_FILE: artifactPath, INDEXER_ALLOW_LOCAL_REBIND: 'false',
      } });
      const timer = setTimeout(() => child.kill(), 20000);
      try { assert.equal((await once(child, 'exit'))[0], 0, 'Compiled worker process failed'); } finally { clearTimeout(timer); }
    };
    await (await contract.addProperty('Real RPC fixture', 'Local', 1000n, 10000000000000001n)).wait();
    await (await (contract.connect(buyer) as Contract).buyTokens(1n, 3n, { value: 30000000000000003n })).wait();
    await (await (contract.connect(buyer) as Contract).transferTokens(1n, await buyer.getAddress(), 1n)).wait();
    await (await (contract.connect(buyer) as Contract).transferTokens(1n, await recipient.getAddress(), 2n)).wait();
    await runProcess();
    const first = (await source.query('SELECT * FROM properties WHERE canonical_snapshot'))[0];
    assert.equal(first.available_tokens, '997'); assert.equal(first.token_price_wei, '10000000000000001');
    await runProcess();
    assert.equal((await source.query('SELECT id FROM properties WHERE canonical_snapshot'))[0].id, first.id);
    assert.equal((await source.query('SELECT count(*) FROM chain_events'))[0].count, '4');
    // Publish only an isolated test fixture through SQL; no write API is introduced.
    await source.query(`INSERT INTO property_metadata_versions(property_id,version,state,title,description) VALUES($1,1,'published','TEST fixture title','Published full-stack test description')`, [first.id]);
    const env = validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, DATABASE_SCHEMA: schema });
    const module = await Test.createTestingModule({ imports: [AppModule.register(env as unknown as Record<string, unknown>)] }).overrideProvider(DataSource).useValue(source).overrideProvider(JsonLogger).useValue(logger).compile();
    api = module.createNestApplication({ logger: false }); configureHttp(api, env, logger); await api.listen(0, '127.0.0.1');
    // Native import preserves the frontend's typed modules without including them
    // in the backend TypeScript output. Supported by the repository's Node 22.19.
    const importFrontend = (name: string) => new Function('url', 'return import(url)')(pathToFileURL(join(root, 'react-frontend/src/lib', name)).href);
    const { ApiClient, apiSettings } = await importFrontend('api-client.ts');
    const { loadIndexedCatalog, mergeIndexedCatalog, integrationFailure } = await importFrontend('indexed-catalog.ts');
    const { readProperties, purchaseCost } = await importFrontend('marketplace.js');
    const ethers5 = createRequire(join(root, 'react-frontend/package.json'))('ethers').ethers;
    const browserProvider = new ethers5.providers.JsonRpcProvider({ url: rpcUrl, timeout: 2000 }, 31337);
    const browserContract = new ethers5.Contract(await contract.getAddress(), artifact.abi, browserProvider);
    const listings = await readProperties(browserContract, await buyer.getAddress());
    const client = new ApiClient(apiSettings({ VITE_API_BASE_URL: await api.getUrl() }));
    const identity = { chainId: '31337', address: await contract.getAddress(), deploymentBlock: 1 };
    const catalog = await loadIndexedCatalog({ client, chain: identity, rpc: browserProvider, codeHash: keccak256, selectedId: '1' });
    const enriched = mergeIndexedCatalog(listings, catalog, 30000);
    assert.equal(enriched[0].description, 'Published full-stack test description');
    assert.equal(enriched[0].metadataInfo.source, 'api');
    assert.equal(enriched[0].mine, '1');
    assert.equal(purchaseCost(enriched[0], '3').toString(), '30000000000000003');
    await source.query(`UPDATE indexer_cursors SET last_success_at=now()-interval '1 hour'`);
    await assert.rejects(loadIndexedCatalog({ client, chain: identity, rpc: browserProvider, codeHash: keccak256 }), /indexer is behind/);
    await source.query('UPDATE indexer_cursors SET last_success_at=now()');
    const badIdentity = { ...identity, address: '0x1111111111111111111111111111111111111111' };
    const noMatch = await loadIndexedCatalog({ client, chain: badIdentity, rpc: browserProvider, codeHash: keccak256 });
    assert.equal(noMatch.records.length, 0);
    const failedClient = new ApiClient(apiSettings({ VITE_API_BASE_URL: await api.getUrl() }), async () => { throw new Error('simulated outage'); });
    let failure;
    try { await loadIndexedCatalog({ client: failedClient, chain: identity, rpc: browserProvider, codeHash: keccak256 }); } catch (error) { failure = integrationFailure(error); }
    const fallback = mergeIndexedCatalog(listings, failure, 30000);
    assert.equal(fallback[0].sample, false); assert.equal(fallback[0].mine, '1'); assert.equal(purchaseCost(fallback[0], '3').toString(), '30000000000000003');
    const snapshot = await provider.send('evm_snapshot', []);
    await (await (contract.connect(buyer) as Contract).buyTokens(1n, 2n, { value: 20000000000000002n })).wait();
    await worker().tick();
    assert.equal((await source.query('SELECT available_tokens FROM properties WHERE canonical_snapshot'))[0].available_tokens, '995');
    await provider.send('evm_revert', [snapshot]);
    await (await contract.setPropertyStatus(1n, false)).wait();
    await worker().tick();
    const forked = (await source.query('SELECT * FROM properties WHERE canonical_snapshot'))[0];
    assert.equal(forked.available_tokens, '997'); assert.equal(forked.active, false);
    assert.equal((await source.query('SELECT reorg_count FROM indexer_cursors'))[0].reorg_count, 1);
    await (await contract.withdrawFunds()).wait(); await worker().tick();
    await provider.send('hardhat_reset', []);
    await assert.rejects(worker().tick(), /reset_requires_rebind/);
    assert.equal((await source.query('SELECT count(*) FROM properties WHERE canonical_snapshot'))[0].count, '0');
    const replacement = await deploy();
    await (await replacement.addProperty('After reset', 'Local', 10n, 1n)).wait();
    const rebound = new IndexingWorker(source, rpc, { ...settings, allowRebind: true }, loadTarget(settings), logger);
    await rebound.tick();
    assert.equal((await source.query('SELECT chain_name FROM properties WHERE canonical_snapshot'))[0].chain_name, 'After reset');
    assert.equal((await source.query('SELECT count(*) FROM deployment_instances'))[0].count, '2');
  } finally {
    await api?.close();
    provider?.destroy(); await stop(node);
    if (api && !source.isInitialized) await source.initialize();
    if (source.isInitialized) { assert.match(schema, /^test_[a-f0-9]{32}$/); await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await source.destroy(); }
    // mkdtemp created this exact directory; no repository manifests are touched.
    assert.equal(resolve(temp, '..'), resolve(tmpdir())); assert.match(temp.split(/[\\/]/).at(-1)!, /^brickshare-indexer-live-/);
    rmSync(temp, { recursive: true, force: true });
  }
});
