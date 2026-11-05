import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { apiEnvPath, validateEnvironment } from '../src/config/environment';
import { createDataSource } from '../src/database/data-source';
import { DatabaseService } from '../src/database/database.module';
import { HealthController } from '../src/health/health.module';
import { PropertiesController } from '../src/properties/properties.module';
import { PropertiesService } from '../src/properties/properties.service';
import { configureHttp } from '../src/common/http';
import { JsonLogger } from '../src/common/json-logger';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { ConfigService } from '@nestjs/config';
import { AssetsService } from '../src/assets/assets.module';
import { PropertyAsset } from '../src/database/entities';
import { SynchronizationService } from '../src/indexer/synchronization.module';

const input = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:unit-only@127.0.0.1/brickshare_test' };
const env = validateEnvironment(input);
const logs: string[] = [];
const logger = new JsonLogger(line => logs.push(line));
let app: INestApplication;
let readyState = 'ready';
let fail = false;
before(async () => {
  const module = await Test.createTestingModule({ controllers: [HealthController, PropertiesController], providers: [
    { provide: DatabaseService, useValue: { ready: async () => readyState } },
    { provide: SynchronizationService, useValue: { status: async () => ({ mode: 'local_read_only', data: [] }) } },
    { provide: PropertiesService, useValue: {
      list: async (query: unknown) => { if (fail) throw new Error('private-password-and-query'); return { query }; },
      find: async () => { throw new NotFoundException('Property not found'); },
    } },
  ] }).compile();
  app = module.createNestApplication({ logger: false });
  configureHttp(app, env, logger);
  await app.init();
});
after(async () => { await app?.close(); });

test('environment rejects invalid credentials, TLS, schema and origins without exposing values', () => {
  for (const patch of [{ DATABASE_URL: undefined }, { DATABASE_URL: 'postgresql://u:CHANGE_ME@localhost/db' }, { DATABASE_SCHEMA: 'public;DROP TABLE x' }, { DATABASE_SSL: 'yes' }, { API_PORT: '1.5' }, { NODE_ENV: 'production' }, { CORS_ORIGINS: 'https://example.com/path' }, { ASSET_PUBLIC_BASE_URL: 'http://example.com' }]) {
    assert.throws(() => validateEnvironment({ ...input, ...patch }), error => error instanceof Error && !error.message.includes('unit-only'));
  }
  assert.equal(validateEnvironment({ ...input, DATABASE_SSL: 'true' }).DATABASE_SSL, true);
  assert.ok(apiEnvPath.replace(/\\/g, '/').endsWith('/apps/api/.env'));
});
test('schema synchronization, migrations on startup and ORM query logs are disabled', () => {
  const source = createDataSource(env);
  assert.equal(source.options.synchronize, false);
  assert.equal(source.options.migrationsRun, false);
  assert.equal(source.options.logging, false);
  assert.equal((source.options as PostgresConnectionOptions).installExtensions, false);
});
test('liveness stays available; readiness distinguishes database and schema failures', async () => {
  await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'alive' });
  for (const state of ['ready', 'database_unavailable', 'schema_pending']) {
    readyState = state;
    const response = await request(app.getHttpServer()).get('/health/ready').expect(state === 'ready' ? 200 : 503);
    assert.equal(response.body.checks.database, state);
  }
});
test('query validation rejects invalid numbers, arrays, IDs, sources and unknown fields', async () => {
  for (const query of ['page=0', 'limit=101', 'page=1.5', 'source=all', 'q=' + 'a'.repeat(101), 'q=a&q=b', 'deploymentId=bad', 'chainId=9223372036854775808', 'chainId=-1', 'unexpected=true']) {
    await request(app.getHttpServer()).get('/api/v1/properties?' + query).expect(400);
  }
  const response = await request(app.getHttpServer()).get('/api/v1/properties?page=2&limit=5').expect(200);
  assert.deepEqual(response.body.query, { page: 2, limit: 5, source: 'blockchain' });
  await request(app.getHttpServer()).get('/api/v1/properties/bad').expect(400);
});
test('missing records return 404 and unexpected errors are redacted and correlated', async () => {
  await request(app.getHttpServer()).get('/api/v1/properties/11111111-1111-4111-8111-111111111111').expect(404);
  fail = true;
  try {
    const response = await request(app.getHttpServer()).get('/api/v1/properties?q=sensitive-query').expect(500);
    assert.equal(response.body.error.message, 'Internal server error');
    assert.equal(response.body.error.requestId, response.headers['x-request-id']);
    assert.ok(!JSON.stringify(response.body).includes('private-password'));
    assert.ok(!logs.join('\n').includes('sensitive-query'));
    assert.ok(!logs.join('\n').includes('private-password'));
    logs.forEach(line => assert.equal(typeof JSON.parse(line).event, 'string'));
  } finally { fail = false; }
});
test('CORS allows configured frontend origins and excludes other origins', async () => {
  const allowed = await request(app.getHttpServer()).get('/health/live').set('Origin', 'http://localhost:5173').expect(200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');
  const other = await request(app.getHttpServer()).get('/health/live').set('Origin', 'https://unlisted.example').expect(200);
  assert.equal(other.headers['access-control-allow-origin'], undefined);
});
test('database connection failures produce readiness failure and a sanitized 503', async () => {
  const source = { isInitialized: false, initialize: async () => { throw new Error('private-connection-secret'); } } as unknown as DataSource;
  const service = new DatabaseService(source, logger);
  await service.onModuleInit();
  assert.equal(await service.ready(), 'database_unavailable');
  await assert.rejects(service.requireReady(), error => error instanceof Error && !error.message.includes('private-connection-secret'));
  assert.ok(!logs.join('\n').includes('private-connection-secret'));
});
test('public assets use only configured HTTPS references and do not claim file availability', () => {
  const config = new ConfigService({ validated: { ...env, ASSET_PUBLIC_BASE_URL: 'https://cdn.example.test/public/' } });
  const asset = new AssetsService(config).present({ assetId: 'test', asset: { objectKey: 'images/house.png', kind: 'image', mimeType: 'image/png', byteSize: '123', sha256: Buffer.alloc(32) } } as PropertyAsset);
  assert.equal(asset.url, 'https://cdn.example.test/public/images/house.png');
  assert.equal(asset.availability, 'configured_external_reference');
  assert.equal(asset.byteSize, '123');
});
