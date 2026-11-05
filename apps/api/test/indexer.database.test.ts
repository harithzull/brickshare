import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createDataSource } from '../src/database/data-source';
import { validateEnvironment } from '../src/config/environment';
import { JsonLogger } from '../src/common/json-logger';
import { configureHttp } from '../src/common/http';
import { DatabaseService } from '../src/database/database.module';
import { SynchronizationService } from '../src/indexer/synchronization.module';
import { IndexingWorker } from '../src/indexer/worker';
import { indexerSettings } from '../src/indexer/config';
import { buyer, digest, FakeChain, recipient } from './indexer.fixture';
import { getCreateAddress } from 'ethers';
import { DeploymentInstance, ChainEvent } from '../src/database/indexer.entities';
import { Rpc } from '../src/indexer/rpc';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must identify a dedicated database ending in _test.');
const logger = new JsonLogger(() => undefined);
async function database(run: (source: DataSource, env: ReturnType<typeof validateEnvironment>) => Promise<void>) {
  const schema = 'test_' + randomUUID().replace(/-/g, '');
  const env = validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: url, DATABASE_SCHEMA: schema });
  const source = createDataSource(env);
  try {
    await source.initialize(); await source.query(`CREATE SCHEMA "${schema}"`); await source.runMigrations({ transaction: 'all' });
    await run(source, env);
  } finally {
    if (!source.isInitialized) await source.initialize();
    assert.match(schema, /^test_[a-f0-9]{32}$/);
    await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await source.destroy();
  }
}
function worker(source: DataSource, chain: FakeChain, overrides = {}) {
  return new IndexingWorker(source, chain, { ...indexerSettings({}), batchSize: 2, ...overrides }, chain.target, logger);
}
async function catchUp(worker: IndexingWorker) { for (let i = 0; i < 100; i++) { if (await worker.tick() === 'synced') return; } throw new Error('Catchup exceeded limit'); }
function populated() {
  const chain = new FakeChain();
  chain.addBlock([['PropertyCreated', [1n, 'Chain property', 'Local City', 1000n, 10000000000000001n]]]);
  chain.addBlock([['TokensPurchased', [1n, buyer, 3n, 30000000000000003n]]]);
  return chain;
}
test('indexer migration upgrades Phase 2A without losing metadata; rollback/reapply works before history exists', async () => database(async source => {
  await source.undoLastMigration();
  await source.undoLastMigration();
  await source.query(`INSERT INTO properties(source,fixture_label) VALUES('fictional','preserved')`);
  assert.equal((await source.runMigrations()).length, 2);
  assert.equal((await source.query('SELECT fixture_label FROM properties'))[0].fixture_label, 'preserved');
  assert.equal(await new DatabaseService(source, logger).ready(), 'ready');
}));
test('restart and duplicate events preserve IDs, exact values and a single canonical event', async () => database(async source => {
  const chain = populated(); chain.duplicateLogs = true;
  await catchUp(worker(source, chain));
  const first = (await source.query('SELECT * FROM properties WHERE canonical_snapshot'))[0];
  assert.equal(first.available_tokens, '997'); assert.equal(first.token_price_wei, '10000000000000001');
  await catchUp(worker(source, chain));
  const second = (await source.query('SELECT * FROM properties WHERE canonical_snapshot'))[0];
  assert.equal(second.id, first.id);
  assert.equal((await source.query('SELECT count(*) FROM chain_events'))[0].count, '2');
  assert.equal((await source.query('SELECT count(*) FROM deployment_instances'))[0].count, '1');
  assert.equal((await source.query('SELECT last_scanned_block FROM indexer_cursors'))[0].last_scanned_block, '3');
}));
test('single-writer advisory lock excludes a second worker and releases on completion', async () => database(async source => {
  const chain = populated(); const runner = source.createQueryRunner(); await runner.connect();
  const key = 'brickshare-indexer:31337';
  await runner.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key]);
  try { assert.equal(await worker(source, chain).tick(), 'locked'); }
  finally { await runner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]); await runner.release(); }
  await catchUp(worker(source, chain));
}));
test('interrupted batch rolls back events, properties and watermark together; retry resumes', async () => database(async source => {
  const chain = populated(); await catchUp(worker(source, chain));
  const before = (await source.query('SELECT * FROM indexer_cursors'))[0];
  chain.addBlock([['TokensTransferred', [1n, buyer, recipient, 1n]]]);
  await source.query(`CREATE FUNCTION abort_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status IN ('synced','syncing') THEN RAISE EXCEPTION 'simulated interruption'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER abort_batch BEFORE UPDATE ON indexer_cursors FOR EACH ROW EXECUTE FUNCTION abort_batch()`);
  await assert.rejects(worker(source, chain).tick(), /processing_failed/);
  assert.equal((await source.query('SELECT count(*) FROM chain_events'))[0].count, '2');
  assert.equal((await source.query('SELECT last_scanned_block FROM indexer_cursors'))[0].last_scanned_block, before.last_scanned_block);
  await source.query('DROP TRIGGER abort_batch ON indexer_cursors; DROP FUNCTION abort_batch()');
  await catchUp(worker(source, chain));
  assert.equal((await source.query('SELECT count(*) FROM chain_events'))[0].count, '3');
}));
test('view/event disagreement never advances the projection; reconciliation can recover', async () => database(async source => {
  const chain = populated(); chain.wrongView = true;
  await assert.rejects(worker(source, chain).tick(), /reconciliation_failed/);
  assert.equal((await source.query('SELECT count(*) FROM properties'))[0].count, '0');
  assert.equal((await source.query('SELECT last_scanned_block FROM indexer_cursors'))[0].last_scanned_block, null);
  chain.wrongView = false; await catchUp(worker(source, chain));
}));
test('new indexer identity, width, cursor and event constraints reject inconsistent records', async () => database(async source => {
  const chain = populated(); await catchUp(worker(source, chain));
  const instance = (await source.getRepository(DeploymentInstance).find())[0];
  const event = (await source.getRepository(ChainEvent).find())[0];
  const code = (expected: string) => (error: any) => error.driverError?.code === expected;
  await assert.rejects(source.query('UPDATE deployment_instances SET fingerprint=$1 WHERE id=$2', [Buffer.alloc(31), instance.id]), code('23514'));
  await assert.rejects(source.getRepository(DeploymentInstance).save({ ...instance, id: randomUUID(), fingerprint: Buffer.alloc(32, 7) }), code('23505'));
  await assert.rejects(source.getRepository(ChainEvent).save({ ...event, id: randomUUID() }), code('23505'));
  await assert.rejects(source.query('UPDATE chain_events SET block_hash=$1 WHERE id=$2', [Buffer.alloc(32, 7), event.id]), code('23503'));
  await assert.rejects(source.query('INSERT INTO indexer_cursors(instance_id) VALUES($1)', [randomUUID()]), code('23503'));
  await assert.rejects(source.query('UPDATE indexer_cursors SET last_scanned_hash=NULL WHERE instance_id=$1', [instance.id]), code('23514'));
  await assert.rejects(source.query('UPDATE properties SET deployment_instance_id=$1 WHERE canonical_snapshot', [randomUUID()]), code('23503'));
}));
test('a branch change during RPC reads aborts the batch without a partial checkpoint', async () => database(async source => {
  const chain = populated();
  let changed = false;
  const rpc: Rpc = { request: async <T>(method: string, params: unknown[]) => {
    const result = await chain.request<T>(method, params);
    if (method === 'eth_getBalance' && !changed) { changed = true; chain.fork(1); chain.addBlock([['PropertyCreated', [1n, 'Changed mid-read', 'Local', 10n, 1n]]], 'mid-read'); }
    return result;
  } };
  const interrupted = new IndexingWorker(source, rpc, indexerSettings({}), chain.target, logger);
  await assert.rejects(interrupted.tick(), /batch_changed/);
  assert.equal((await source.query('SELECT count(*) FROM properties'))[0].count, '0');
  assert.equal((await source.query('SELECT last_scanned_block FROM indexer_cursors'))[0].last_scanned_block, null);
  await catchUp(worker(source, chain));
}));
test('shallow reorg removes orphan effects, preserves raw events and replays canonical history', async () => database(async source => {
  const chain = populated(); await catchUp(worker(source, chain));
  chain.fork(2); chain.addBlock([['TokensPurchased', [1n, buyer, 5n, 50000000000000005n]]], 'fork');
  await catchUp(worker(source, chain));
  assert.equal((await source.query('SELECT available_tokens FROM properties WHERE canonical_snapshot'))[0].available_tokens, '995');
  assert.equal((await source.query('SELECT count(*) FROM chain_events WHERE NOT canonical'))[0].count, '1');
  assert.equal((await source.query('SELECT reorg_count FROM indexer_cursors'))[0].reorg_count, 1);
  assert.equal((await source.query('SELECT count(*) FROM chain_events WHERE canonical'))[0].count, '2');
}));
test('failed shallow-reorg reconciliation hides known orphan snapshots until repair succeeds', async () => database(async source => {
  const chain = populated(); await catchUp(worker(source, chain));
  chain.fork(2); chain.addBlock([['TokensPurchased', [1n, buyer, 5n, 50000000000000005n]]], 'failed-repair'); chain.wrongView = true;
  await assert.rejects(worker(source, chain).tick(), /reconciliation_failed/);
  assert.equal((await source.query('SELECT count(*) FROM properties WHERE canonical_snapshot'))[0].count, '0');
  assert.equal((await source.query('SELECT last_scanned_block FROM indexer_cursors'))[0].last_scanned_block, '3');
  chain.wrongView = false; await catchUp(worker(source, chain));
  assert.equal((await source.query('SELECT available_tokens FROM properties WHERE canonical_snapshot'))[0].available_tokens, '995');
}));
test('reorged property creation does not inherit old metadata when the on-chain ID is reused', async () => database(async source => {
  const chain = populated(); await catchUp(worker(source, chain));
  const old = (await source.query('SELECT id FROM properties WHERE canonical_snapshot'))[0];
  await source.query(`INSERT INTO property_metadata_versions(property_id,version,state,title) VALUES($1,1,'published','old metadata')`, [old.id]);
  chain.fork(1); chain.addBlock([['PropertyCreated', [1n, 'Replacement', 'Different City', 20n, 2n]]], 'replacement');
  await catchUp(worker(source, chain));
  const current = (await source.query('SELECT * FROM properties WHERE canonical_snapshot'))[0];
  assert.notEqual(current.id, old.id); assert.equal(current.chain_name, 'Replacement');
  assert.equal((await source.query('SELECT count(*) FROM property_metadata_versions WHERE property_id=$1', [current.id]))[0].count, '0');
  await source.undoLastMigration();
  await assert.rejects(source.undoLastMigration(), /Indexer rollback would collapse property history/);
}));
test('deep reorg invalidates snapshots and requires explicit replay acknowledgement', async () => database(async source => {
  const chain = populated(); for (let i = 0; i < 5; i++) chain.addBlock();
  await catchUp(worker(source, chain));
  chain.fork(1); chain.addBlock([['PropertyCreated', [1n, 'New branch', 'Local', 20n, 1n]]], 'deep');
  await assert.rejects(worker(source, chain, { reorgDepth: 1 }).tick(), /reorg_too_deep/);
  assert.equal((await source.query('SELECT count(*) FROM properties WHERE canonical_snapshot'))[0].count, '0');
  await assert.rejects(worker(source, chain).tick(), /reset_requires_rebind/);
  await catchUp(worker(source, chain, { allowRebind: true }));
  assert.equal((await source.query('SELECT chain_name FROM properties WHERE canonical_snapshot'))[0].chain_name, 'New branch');
}));
test('Hardhat reset with identical address/receipt invalidates old data and isolates new incarnation', async () => database(async source => {
  const oldChain = populated(); await catchUp(worker(source, oldChain));
  const next = new FakeChain(); next.runId = digest('new-hardhat-run');
  next.addBlock([['PropertyCreated', [1n, 'After reset', 'Local', 5n, 1n]]]);
  await assert.rejects(worker(source, next).tick(), /reset_requires_rebind/);
  assert.equal((await source.query('SELECT count(*) FROM properties WHERE canonical_snapshot'))[0].count, '0');
  await catchUp(worker(source, next, { allowRebind: true }));
  assert.equal((await source.query('SELECT count(*) FROM deployment_instances'))[0].count, '2');
  assert.equal((await source.query('SELECT count(*) FROM deployment_instances WHERE active'))[0].count, '1');
  assert.equal((await source.query('SELECT chain_name FROM properties WHERE canonical_snapshot'))[0].chain_name, 'After reset');
}));
test('RPC failure preserves last watermark and reports degraded freshness without leaking errors', async () => database(async (source, env) => {
  const chain = populated(); await catchUp(worker(source, chain));
  chain.fail = true; await assert.rejects(worker(source, chain).tick());
  const service = new SynchronizationService(new DatabaseService(source, logger), new ConfigService({ validated: env }));
  const state = await service.status();
  assert.equal(state.data[0].freshness, 'degraded'); assert.equal(state.data[0].indexedBlock, '3');
  assert.ok(!JSON.stringify(state).includes('rpc-failure-secret'));
}));
test('reset followed by deployment to a different address also invalidates the previous contract', async () => database(async source => {
  const previous = populated(); await catchUp(worker(source, previous));
  const next = new FakeChain(); next.runId = digest('different-address-reset'); next.nonce = '0x1';
  next.target.address = getCreateAddress({ from: next.target.deployer, nonce: 1 }).toLowerCase();
  next.target.transactionHash = digest('different-deployment');
  next.addBlock([['PropertyCreated', [1n, 'Different contract', 'Local', 10n, 1n]]]);
  await assert.rejects(worker(source, next).tick(), /reset_requires_rebind/);
  assert.equal((await source.query('SELECT count(*) FROM properties WHERE canonical_snapshot'))[0].count, '0');
  // A restart must not bypass the acknowledgement after invalidation was recorded.
  await assert.rejects(worker(source, next).tick(), /reset_requires_rebind/);
  await catchUp(worker(source, next, { allowRebind: true }));
  assert.equal((await source.query('SELECT count(*) FROM contract_deployments'))[0].count, '2');
  assert.equal((await source.query('SELECT chain_name FROM properties WHERE canonical_snapshot'))[0].chain_name, 'Different contract');
}));
test('API exposes reconciled provenance and freshness, excludes invalidated snapshots and keeps fictional data separate', async () => database(async (source, env) => {
  const chain = populated(); await catchUp(worker(source, chain));
  const module = await Test.createTestingModule({ imports: [AppModule.register(env as unknown as Record<string, unknown>)] }).overrideProvider(DataSource).useValue(source).overrideProvider(JsonLogger).useValue(logger).compile();
  const app = module.createNestApplication({ logger: false }); configureHttp(app, env, logger); await app.init();
  try {
    const server = app.getHttpServer();
    const list = await request(server).get('/api/v1/properties').expect(200);
    assert.equal(list.body.data[0].blockchain.source, 'reconciled_local_chain_snapshot');
    assert.equal(list.body.data[0].blockchain.tokenPriceWei, '10000000000000001');
    assert.equal(list.body.data[0].blockchain.synchronization.indexedBlock, '3');
    const status = await request(server).get('/api/v1/synchronization').expect(200);
    assert.equal(status.body.data[0].status, 'synced'); assert.equal(status.body.data[0].freshness, 'recently_checked');
    await source.query(`UPDATE indexer_cursors SET last_success_at=now()-interval '1 hour'`);
    assert.equal((await request(server).get('/api/v1/synchronization').expect(200)).body.data[0].freshness, 'stale');
    const reset = new FakeChain(); reset.runId = digest('API-reset');
    await assert.rejects(worker(source, reset).tick());
    assert.equal((await request(server).get('/api/v1/properties').expect(200)).body.data.length, 0);
    await request(server).get('/api/v1/properties/' + list.body.data[0].id).expect(404);
    await request(server).get('/health/ready').expect(200);
  } finally { await app.close(); }
}));
