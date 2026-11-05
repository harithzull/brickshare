import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { validateEnvironment } from '../src/config/environment';
import { createDataSource } from '../src/database/data-source';
import { DatabaseService } from '../src/database/database.module';
import { Chain, ContractDeployment, Property, PropertyMetadataVersion, PublicAsset } from '../src/database/entities';
import { fictionalPropertyId, seedFictional, seedNetworks } from '../src/database/seeds';
import { configureHttp } from '../src/common/http';
import { JsonLogger } from '../src/common/json-logger';

// Never fall back to DATABASE_URL, the public schema, or an ordinary application DB.
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must identify a dedicated database ending in _test.');
const schema = 'test_' + randomUUID().replace(/-/g, '');
const env = validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: url, DATABASE_SCHEMA: schema, ALLOW_FICTIONAL_SEED: true });
const logger = new JsonLogger(() => undefined);
let source: DataSource;
let app: INestApplication | undefined;
let deploymentId: string;
let snapshotId: string;
const uintMax = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
const rejected = async (sql: string, parameters: unknown[] = [], code = '23514') => {
  await assert.rejects(source.query(sql, parameters), (error: { driverError?: { code: string } }) => error.driverError?.code === code);
};
before(async () => {
  source = createDataSource(env);
  await source.initialize();
  await source.query(`CREATE SCHEMA "${schema}"`);
});
after(async () => {
  await app?.close();
  if (source && !source.isInitialized) await source.initialize();
  if (source?.isInitialized) {
    assert.match(schema, /^test_[a-f0-9]{32}$/);
    await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    await source.destroy();
  }
});

test('migration is explicit, transactional, reversible and repeatable', async () => {
  const database = new DatabaseService(source, logger);
  assert.equal(await database.ready(), 'schema_pending');
  assert.equal((await source.runMigrations({ transaction: 'all' })).length, 2);
  assert.equal(await database.ready(), 'ready');
  assert.equal((await source.runMigrations()).length, 0);
  await source.undoLastMigration({ transaction: 'all' });
  assert.equal(await database.ready(), 'schema_pending');
  await source.undoLastMigration({ transaction: 'all' });
  const tables = await source.query('SELECT tablename FROM pg_tables WHERE schemaname=$1', [schema]);
  assert.deepEqual(tables.map((row: { tablename: string }) => row.tablename), ['api_migrations']);
  assert.equal((await source.runMigrations({ transaction: 'all' })).length, 2);
});
test('network seed is idempotent and fictional seeding is explicitly guarded', async () => {
  await seedNetworks(source); await seedNetworks(source);
  assert.equal(await source.getRepository(Chain).count(), 2);
  await assert.rejects(seedFictional(source, { ...env, ALLOW_FICTIONAL_SEED: false }));
  await assert.rejects(seedFictional(source, { ...env, NODE_ENV: 'production' }));
  await seedFictional(source, env); await seedFictional(source, env);
  assert.equal(await source.getRepository(Property).count(), 1);
  const fixture = await source.getRepository(Property).findOneByOrFail({ id: fictionalPropertyId });
  assert.equal(fixture.deploymentId, null); assert.equal(fixture.tokenPriceWei, null);
  assert.equal(await source.getRepository(Property).countBy({ source: 'blockchain' }), 0);
  await rejected('UPDATE properties SET token_price_wei=100 WHERE id=$1', [fixture.id]);
});
test('chain/deployment identities, address/hash widths and foreign keys are enforced', async () => {
  const chain = await source.getRepository(Chain).findOneByOrFail({ chainId: '84532' });
  await rejected('INSERT INTO chains(chain_id,name) VALUES(84532,\'duplicate\')', [], '23505');
  await rejected('INSERT INTO chains(chain_id,name) VALUES(0,\'invalid\')');
  const deployment = await source.getRepository(ContractDeployment).save({ chainId: chain.id, address: Buffer.alloc(20, 1), deploymentBlock: '1', deploymentBlockHash: Buffer.alloc(32, 2), transactionHash: Buffer.alloc(32, 3), ownerAddress: Buffer.alloc(20, 4), artifactHash: Buffer.alloc(32, 5), abiVersion: 'TEST-ONLY-NOT-DEPLOYED' });
  deploymentId = deployment.id;
  await rejected('UPDATE contract_deployments SET address=$1 WHERE id=$2', [Buffer.alloc(19), deploymentId]);
  await rejected('UPDATE contract_deployments SET transaction_hash=$1 WHERE id=$2', [Buffer.alloc(31), deploymentId]);
  await rejected('UPDATE contract_deployments SET chain_id=$1 WHERE id=$2', [randomUUID(), deploymentId], '23503');
  await rejected('INSERT INTO contract_deployments SELECT gen_random_uuid(),chain_id,address,deployment_block,deployment_block_hash,transaction_hash,owner_address,artifact_hash,abi_version,release_reference,created_at,updated_at FROM contract_deployments WHERE id=$1', [deploymentId], '23505');
});
test('uint256 values round-trip exactly; invalid supply, price and identity fail', async () => {
  const snapshot = await source.getRepository(Property).save({ source: 'blockchain', deploymentId, onChainId: uintMax, chainName: 'TEST SNAPSHOT ONLY', chainLocation: 'Test City', totalTokens: uintMax, availableTokens: uintMax, tokenPriceWei: uintMax, active: true, observedBlock: '9007199254740993', observedBlockHash: Buffer.alloc(32, 6) });
  snapshotId = snapshot.id;
  const loaded = await source.getRepository(Property).findOneByOrFail({ id: snapshot.id });
  assert.equal(loaded.tokenPriceWei, uintMax); assert.equal(loaded.observedBlock, '9007199254740993');
  for (const assignment of ['total_tokens=0', 'available_tokens=-1', 'available_tokens=total_tokens+1', 'token_price_wei=0', 'on_chain_id=0', 'token_price_wei=' + (BigInt(uintMax) + 1n), 'observed_block=-1']) {
    await rejected(`UPDATE properties SET ${assignment} WHERE id=$1`, [snapshotId]);
  }
  await rejected('UPDATE properties SET deployment_id=$1 WHERE id=$2', [randomUUID(), snapshotId], '23503');
  await rejected('INSERT INTO properties SELECT gen_random_uuid(),source,fixture_label,deployment_id,on_chain_id,chain_name,chain_location,total_tokens,available_tokens,token_price_wei,active,observed_block,observed_block_hash,created_at,updated_at FROM properties WHERE id=$1', [snapshotId], '23505');
});
test('metadata versions are sequential, unique, immutable once published and retain asset references', async () => {
  const current = await source.getRepository(PropertyMetadataVersion).findOneByOrFail({ propertyId: fictionalPropertyId, version: 1 });
  await rejected('UPDATE property_metadata_versions SET title=\'tampered\' WHERE id=$1', [current.id]);
  await rejected('DELETE FROM property_metadata_versions WHERE id=$1', [current.id]);
  await rejected('INSERT INTO property_metadata_versions(property_id,version) VALUES($1,4)', [fictionalPropertyId]);
  const draft = await source.getRepository(PropertyMetadataVersion).save({ propertyId: fictionalPropertyId, version: 2, state: 'draft', title: 'PRIVATE DRAFT NOT PUBLIC' });
  await rejected('UPDATE property_metadata_versions SET state=\'published\' WHERE id=$1', [draft.id], '23505');
  await rejected('UPDATE property_assets SET caption=\'changed\' WHERE metadata_version_id=$1', [current.id]);
  await rejected('DELETE FROM property_assets WHERE metadata_version_id=$1', [current.id]);
  const asset = await source.getRepository(PublicAsset).findOneByOrFail({ objectKey: 'fixtures/fictional-overview.txt' });
  await rejected('UPDATE public_assets SET sha256=$1 WHERE id=$2', [Buffer.alloc(32, 7), asset.id]);
  await rejected('UPDATE public_assets SET object_key=\'../private.txt\' WHERE id=$1', [asset.id]);
  await rejected('DELETE FROM public_assets WHERE id=$1', [asset.id], '23503');
  await rejected('DELETE FROM properties WHERE id=$1', [fictionalPropertyId], '23503');
});
test('real HTTP queries return accurate provenance, publication state, precision and pagination', async () => {
  const module = await Test.createTestingModule({ imports: [AppModule.register(env as unknown as Record<string, unknown>)] }).overrideProvider(DataSource).useValue(source).overrideProvider(JsonLogger).useValue(logger).compile();
  app = module.createNestApplication({ logger: false });
  configureHttp(app, env, logger); await app.init();
  const server = app.getHttpServer();
  await request(server).get('/health/ready').expect(200);
  const networks = await request(server).get('/api/v1/networks').expect(200);
  assert.deepEqual(networks.body.data.map((row: { chainId: string }) => row.chainId), ['31337', '84532']);
  assert.ok(!JSON.stringify(networks.body).includes('DATABASE_URL'));
  const list = await request(server).get('/api/v1/properties').expect(200);
  assert.equal(list.body.meta.total, 1); assert.equal(list.body.data[0].id, snapshotId);
  const detail = await request(server).get('/api/v1/properties/' + snapshotId).expect(200);
  assert.equal(detail.body.data.blockchain.tokenPriceWei, uintMax);
  assert.equal(detail.body.data.blockchain.onChainId, uintMax);
  assert.equal(detail.body.data.blockchain.verifiedByApi, false);
  assert.equal(detail.body.data.metadata, null);
  const fictional = await request(server).get('/api/v1/properties/' + fictionalPropertyId + '?source=fictional').expect(200);
  assert.equal(fictional.body.data.blockchain, null);
  assert.equal(fictional.body.data.metadata.version, 1);
  assert.equal(fictional.body.data.metadata.assets[0].url, null);
  assert.equal(fictional.body.data.metadata.assets[0].availability, 'not_served_by_api');
  assert.ok(!JSON.stringify(fictional.body).includes('PRIVATE DRAFT'));
  await request(server).get('/api/v1/properties/' + fictionalPropertyId).expect(404);
  await request(server).get('/api/v1/properties/' + randomUUID()).expect(404);
  for (const [query, total] of [['q=Cedar&source=fictional', 1], ['q=%25&source=fictional', 0], ['q=%27%20OR%201%3D1--', 0], ['location=Test%20City', 1], ['chainId=84532', 1], ['chainId=31337', 0], ['deploymentId=' + deploymentId, 1], ['page=2&limit=1', 1]] as const) {
    const response = await request(server).get('/api/v1/properties?' + query).expect(200);
    assert.equal(response.body.meta.total, total, query);
    if (query.startsWith('page=2')) assert.deepEqual(response.body.data, []);
  }
});
test('published metadata can be replaced transactionally while retaining historical versions', async () => {
  await source.transaction(async manager => {
    await manager.query('UPDATE property_metadata_versions SET state=\'archived\' WHERE property_id=$1 AND version=1', [fictionalPropertyId]);
    await manager.query('UPDATE property_metadata_versions SET state=\'published\' WHERE property_id=$1 AND version=2', [fictionalPropertyId]);
  });
  const response = await request(app!.getHttpServer()).get('/api/v1/properties/' + fictionalPropertyId + '?source=fictional').expect(200);
  assert.equal(response.body.data.metadata.version, 2);
  assert.equal(await source.getRepository(PropertyMetadataVersion).countBy({ propertyId: fictionalPropertyId }), 2);
});
test('database query failures are redacted; pending schema returns 503 and recovers', async () => {
  const server = app!.getHttpServer();
  await source.query('ALTER TABLE properties RENAME TO properties_temporarily_missing');
  try {
    const response = await request(server).get('/api/v1/properties').expect(500);
    assert.equal(response.body.error.message, 'Internal server error');
    assert.ok(!JSON.stringify(response.body).includes('SELECT'));
  } finally { await source.query('ALTER TABLE properties_temporarily_missing RENAME TO properties'); }
  await source.query('ALTER TABLE api_migrations RENAME TO api_migrations_temporarily_missing');
  try {
    const response = await request(server).get('/health/ready').expect(503);
    assert.equal(response.body.checks.database, 'schema_pending');
    await request(server).get('/api/v1/properties').expect(503);
    await request(server).get('/health/live').expect(200);
  } finally { await source.query('ALTER TABLE api_migrations_temporarily_missing RENAME TO api_migrations'); }
  await request(server).get('/health/ready').expect(200);
});
