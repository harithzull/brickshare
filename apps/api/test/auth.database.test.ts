import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Wallet } from 'ethers';
import { SiweMessage } from 'siwe';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { validateEnvironment } from '../src/config/environment';
import { createDataSource } from '../src/database/data-source';
import { configureHttp } from '../src/common/http';
import { JsonLogger } from '../src/common/json-logger';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must identify a dedicated database ending in _test.');
async function fixture(run: (f: any) => Promise<void>) {
  const schema = 'test_' + randomUUID().replace(/-/g, '');
  const env = validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: url, DATABASE_SCHEMA: schema });
  const source = createDataSource(env); let app: any;
  const lines: string[] = []; const logger = new JsonLogger(line => lines.push(line));
  try {
    await source.initialize(); await source.query(`CREATE SCHEMA "${schema}"`); await source.runMigrations();
    const module = await Test.createTestingModule({ imports: [AppModule.register(env as unknown as Record<string, unknown>)] }).overrideProvider(DataSource).useValue(source).overrideProvider(JsonLogger).useValue(logger).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false }); configureHttp(app, env, logger); await app.init();
    const server = app.getHttpServer();
    const mutate = (agent: any, path: string, body: unknown, csrf?: string, method = 'post') => {
      let call = agent[method](path).set('Origin', env.AUTH_ORIGIN).set('X-BrickShare-Auth', '1').set('Content-Type', 'application/json');
      if (csrf) call = call.set('X-CSRF-Token', csrf); return call.send(body);
    };
    const nonce = async (agent: any, wallet: any) => (await mutate(agent, '/api/v1/auth/nonce', { address: wallet.address, chainId: 31337 }).expect(201));
    const login = async (wallet = Wallet.createRandom()) => {
      const agent = request.agent(server); const n = await nonce(agent, wallet);
      const signature = await wallet.signMessage(n.body.message);
      const verified = await mutate(agent, '/api/v1/auth/verify', { challengeId: n.body.challengeId, message: n.body.message, signature }, n.body.csrfToken).expect(201);
      const me = (await agent.get('/api/v1/me').set('Origin', env.AUTH_ORIGIN).expect(200)).body;
      assert.equal(me.authenticated, true);
      return { agent, wallet, me, csrf: me.csrfToken, verified, nonce: n, signature };
    };
    await run({ source, env, app, server, lines, mutate, nonce, login });
  } finally {
    await app?.close(); if (!source.isInitialized) await source.initialize();
    assert.match(schema, /^test_[a-f0-9]{32}$/); await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await source.destroy();
  }
}
test('auth migration upgrades/rolls back/reapplies independently without changing public catalog data', async () => fixture(async ({ source }: any) => {
  await source.undoLastMigration(); await source.undoLastMigration(); await source.query(`INSERT INTO properties(source,fixture_label) VALUES('fictional','preserved')`);
  assert.equal((await source.runMigrations()).length, 2);
  assert.equal((await source.query('SELECT fixture_label FROM properties'))[0].fixture_label, 'preserved');
  assert.equal((await source.query(`SELECT count(*) FROM pg_indexes WHERE schemaname=current_schema() AND indexname='memberships_user_idx'`))[0].count, '1');
}));
test('valid login creates an investor, hash-only session, secure cookie attributes and private session restoration', async () => fixture(async ({ login, source, lines }: any) => {
  const user = await login();
  assert.equal(user.me.user.platformRole, 'investor'); assert.equal(user.me.wallet.kind, 'EOA'); assert.equal(user.me.wallet.chainId, '31337');
  const cookie = user.verified.headers['set-cookie'].find((value: string) => value.startsWith('brickshare_session='));
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\//); assert.ok(!cookie.includes('Domain='));
  const [session] = await source.query('SELECT * FROM sessions'); assert.equal(session.token_hash.length, 32); assert.equal(session.csrf_hash.length, 32);
  assert.equal((await source.query('SELECT count(*) FROM users'))[0].count, '1');
  assert.ok(!lines.join('').includes(user.signature)); assert.ok(!lines.join('').includes(user.nonce.body.nonce)); assert.ok(!lines.join('').includes(user.csrf));
}));
test('invalid signatures spend the challenge and cannot be retried with a valid signature', async () => fixture(async ({ server, nonce, mutate }: any) => {
  const wallet = Wallet.createRandom(); const agent = request.agent(server); const n = await nonce(agent, wallet);
  const binding = n.headers['set-cookie'][0].split(';')[0];
  const body = { challengeId: n.body.challengeId, message: n.body.message, signature: await Wallet.createRandom().signMessage(n.body.message) };
  await mutate(agent, '/api/v1/auth/verify', body, n.body.csrfToken).expect(401);
  body.signature = await wallet.signMessage(body.message);
  await mutate(request(server), '/api/v1/auth/verify', body, n.body.csrfToken).set('Cookie', binding).expect(401);
}));
test('nonce replay and parallel verification issue at most one session', async () => fixture(async ({ server, nonce, mutate, source }: any) => {
  const wallet = Wallet.createRandom(); const agent = request.agent(server); const n = await nonce(agent, wallet);
  const binding = n.headers['set-cookie'][0].split(';')[0];
  const body = { challengeId: n.body.challengeId, message: n.body.message, signature: await wallet.signMessage(n.body.message) };
  const results = await Promise.all([1, 2].map(() => mutate(request(server), '/api/v1/auth/verify', body, n.body.csrfToken).set('Cookie', binding)));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 401]);
  assert.equal((await source.query('SELECT count(*) FROM sessions'))[0].count, '1');
}));
test('expired challenges, wrong domain/URI/chain/issued-at and modified messages are rejected', async () => fixture(async ({ server, nonce, mutate, source }: any) => {
  const wallet = Wallet.createRandom();
  for (const patch of [{ domain: 'evil.example' }, { uri: 'https://evil.example/' }, { chainId: 84532 }, { issuedAt: new Date(Date.now() + 600000).toISOString() }, { expirationTime: new Date(Date.now() - 10000).toISOString() }]) {
    const agent = request.agent(server); const n = await nonce(agent, wallet); const message = new SiweMessage(n.body.message); Object.assign(message, patch); const text = message.prepareMessage();
    await mutate(agent, '/api/v1/auth/verify', { challengeId: n.body.challengeId, message: text, signature: await wallet.signMessage(text) }, n.body.csrfToken).expect(401);
  }
  const agent = request.agent(server); const n = await nonce(agent, wallet);
  await source.query(`UPDATE auth_challenges SET issued_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1`, [n.body.challengeId]);
  await mutate(agent, '/api/v1/auth/verify', { challengeId: n.body.challengeId, message: n.body.message, signature: await wallet.signMessage(n.body.message) }, n.body.csrfToken).expect(401);
}));
test('pre-login CSRF, cross-origin login, unsupported chain and cross-browser challenge theft fail closed', async () => fixture(async ({ server, nonce, mutate, env }: any) => {
  const wallet = Wallet.createRandom(); const agent = request.agent(server);
  await request(server).post('/api/v1/auth/nonce').set('Origin', 'https://evil.example').set('X-BrickShare-Auth', '1').send({ address: wallet.address, chainId: 31337 }).expect(403);
  await request(server).post('/api/v1/auth/nonce').set('Origin', env.AUTH_ORIGIN).send({ address: wallet.address, chainId: 31337 }).expect(403);
  await mutate(agent, '/api/v1/auth/nonce', { address: wallet.address, chainId: 84532 }).expect(403);
  const n = await nonce(agent, wallet); const body = { challengeId: n.body.challengeId, message: n.body.message, signature: await wallet.signMessage(n.body.message) };
  await mutate(request(server), '/api/v1/auth/verify', body, n.body.csrfToken).expect(403);
  await mutate(agent, '/api/v1/auth/verify', body).expect(403);
  await mutate(agent, '/api/v1/auth/verify', body, 'a'.repeat(43)).expect(401);
}));
test('session CSRF, logout, expiration and rotation preserve server authorization', async () => fixture(async ({ login, mutate, source, env }: any) => {
  const first = await login();
  await mutate(first.agent, '/api/v1/organizations', { name: 'FICTIONAL one' }).expect(403);
  await first.agent.post('/api/v1/organizations').set('Origin', 'https://evil.example').set('X-BrickShare-Auth', '1').set('X-CSRF-Token', first.csrf).send({ name: 'evil' }).expect(403);
  await mutate(first.agent, '/api/v1/auth/logout', {}, first.csrf).expect(201);
  assert.equal((await first.agent.get('/api/v1/me').set('Origin', env.AUTH_ORIGIN)).body.authenticated, false);
  await first.agent.get('/api/v1/organizations').expect(401);
  const second = await login(); await source.query(`UPDATE sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE user_id=$1`, [second.me.user.id]);
  assert.equal((await second.agent.get('/api/v1/me')).body.authenticated, false);
  await second.agent.get('/api/v1/organizations').expect(401);
}));
test('signing in again rotates the existing browser session and preserves the verified user', async () => fixture(async ({ login, nonce, mutate, source }: any) => {
  const user = await login(); const n = await nonce(user.agent, user.wallet);
  await mutate(user.agent, '/api/v1/auth/verify', { challengeId: n.body.challengeId, message: n.body.message, signature: await user.wallet.signMessage(n.body.message) }, n.body.csrfToken).expect(201);
  const me = (await user.agent.get('/api/v1/me')).body; assert.equal(me.user.id, user.me.user.id);
  assert.notEqual(me.csrfToken, user.csrf);
  const rows = await source.query('SELECT revoked_at FROM sessions WHERE user_id=$1', [user.me.user.id]);
  assert.equal(rows.length, 2); assert.equal(rows.filter((row: any) => row.revoked_at === null).length, 1);
  await mutate(user.agent, '/api/v1/organizations', { name: 'FICTIONAL stale CSRF' }, user.csrf).expect(403);
}));

test('expired, revoked and suspended-issuer invitations never grant membership', async () => fixture(async ({ login, mutate, source }: any) => {
  const owner = await login(); const target = await login();
  const org = (await mutate(owner.agent, '/api/v1/organizations', { name: 'FICTIONAL invitation lifecycle' }, owner.csrf)).body.data;
  const invite = async () => (await mutate(owner.agent, `/api/v1/organizations/${org.id}/invitations`, { address: target.wallet.address, role: 'viewer' }, owner.csrf).expect(201)).body.data;
  const expired = await invite(); await source.query(`UPDATE organization_invitations SET created_at=now()-interval '3 days',expires_at=now()-interval '1 day' WHERE id=$1`, [expired.id]);
  await mutate(target.agent, `/api/v1/invitations/${expired.id}/accept`, {}, target.csrf).expect(404);
  const revoked = await invite(); await mutate(owner.agent, `/api/v1/organizations/${org.id}/invitations/${revoked.id}`, {}, owner.csrf, 'delete').expect(200);
  await mutate(target.agent, `/api/v1/invitations/${revoked.id}/accept`, {}, target.csrf).expect(404);
  const suspended = await invite(); await source.query(`UPDATE users SET status='suspended' WHERE id=$1`, [owner.me.user.id]);
  assert.equal((await target.agent.get('/api/v1/invitations')).body.data.length, 0);
  await mutate(target.agent, `/api/v1/invitations/${suspended.id}/accept`, {}, target.csrf).expect(404);
  assert.equal((await target.agent.get('/api/v1/organizations')).body.data.length, 0);
}));

test('tenant boundaries, owner/editor/viewer permissions and mass-assignment rejection are enforced', async () => fixture(async ({ login, mutate }: any) => {
  const alice = await login(); const bob = await login(); const editor = await login(); const viewer = await login();
  const orgA = (await mutate(alice.agent, '/api/v1/organizations', { name: 'FICTIONAL Cedar Studio' }, alice.csrf).expect(201)).body.data;
  const orgB = (await mutate(bob.agent, '/api/v1/organizations', { name: 'FICTIONAL Harbor Studio' }, bob.csrf).expect(201)).body.data;
  await bob.agent.get(`/api/v1/organizations/${orgA.id}/members`).expect(404);
  await alice.agent.get(`/api/v1/organizations/${orgB.id}/audit`).expect(404);
  assert.equal((await alice.agent.get('/api/v1/organizations')).body.data.length, 1);
  for (const [user, role] of [[editor, 'editor'], [viewer, 'viewer']] as const) {
    const invite = (await mutate(alice.agent, `/api/v1/organizations/${orgA.id}/invitations`, { address: user.wallet.address, role }, alice.csrf).expect(201)).body.data;
    await mutate(user.agent, `/api/v1/invitations/${invite.id}/accept`, {}, user.csrf).expect(201);
  }
  await mutate(editor.agent, `/api/v1/organizations/${orgA.id}`, { name: 'Edited Studio' }, editor.csrf, 'patch').expect(200);
  await mutate(viewer.agent, `/api/v1/organizations/${orgA.id}`, { name: 'Escalation' }, viewer.csrf, 'patch').expect(403);
  await mutate(editor.agent, `/api/v1/organizations/${orgA.id}/invitations`, { address: bob.wallet.address, role: 'viewer' }, editor.csrf).expect(403);
  await editor.agent.get(`/api/v1/organizations/${orgA.id}/audit`).expect(403);
  await viewer.agent.get(`/api/v1/organizations/${orgA.id}/members`).expect(200);
  await mutate(alice.agent, '/api/v1/organizations', { name: 'Escalation', platformRole: 'platform_admin' }, alice.csrf).expect(400);
  await mutate(alice.agent, `/api/v1/organizations/${orgA.id}/invitations`, { address: bob.wallet.address, role: 'owner' }, alice.csrf).expect(400);
  await alice.agent.get('/api/v1/platform/organizations').expect(403);
}));
test('invitation wallet binding, replay, revocation and cross-tenant resource IDs cannot be bypassed', async () => fixture(async ({ login, mutate }: any) => {
  const alice = await login(); const bob = await login(); const target = await login();
  const a = (await mutate(alice.agent, '/api/v1/organizations', { name: 'FICTIONAL A' }, alice.csrf)).body.data;
  const b = (await mutate(bob.agent, '/api/v1/organizations', { name: 'FICTIONAL B' }, bob.csrf)).body.data;
  const invite = (await mutate(alice.agent, `/api/v1/organizations/${a.id}/invitations`, { address: target.wallet.address, role: 'viewer' }, alice.csrf)).body.data;
  assert.equal((await target.agent.get('/api/v1/invitations')).body.data.length, 1);
  assert.equal((await bob.agent.get('/api/v1/invitations')).body.data.length, 0);
  await mutate(bob.agent, `/api/v1/invitations/${invite.id}/accept`, {}, bob.csrf).expect(404);
  await mutate(bob.agent, `/api/v1/organizations/${b.id}/invitations/${invite.id}`, {}, bob.csrf, 'delete').expect(404);
  await mutate(target.agent, `/api/v1/invitations/${invite.id}/accept`, {}, target.csrf).expect(201);
  await mutate(target.agent, `/api/v1/invitations/${invite.id}/accept`, {}, target.csrf).expect(404);
  const bobMember = (await bob.agent.get(`/api/v1/organizations/${b.id}/members`)).body.data[0];
  await mutate(alice.agent, `/api/v1/organizations/${a.id}/members/${bobMember.id}`, { role: 'viewer' }, alice.csrf, 'patch').expect(404);
}));
test('last owner protection survives concurrent role changes and direct database writes', async () => fixture(async ({ login, mutate, source }: any) => {
  const alice = await login(); const bob = await login();
  const org = (await mutate(alice.agent, '/api/v1/organizations', { name: 'FICTIONAL owners' }, alice.csrf)).body.data;
  const invite = (await mutate(alice.agent, `/api/v1/organizations/${org.id}/invitations`, { address: bob.wallet.address, role: 'editor' }, alice.csrf)).body.data;
  await mutate(bob.agent, `/api/v1/invitations/${invite.id}/accept`, {}, bob.csrf);
  const members = (await alice.agent.get(`/api/v1/organizations/${org.id}/members`)).body.data;
  const aliceId = members.find((m: any) => m.userId === alice.me.user.id).id; const bobId = members.find((m: any) => m.userId === bob.me.user.id).id;
  await mutate(alice.agent, `/api/v1/organizations/${org.id}/members/${aliceId}`, { role: 'viewer' }, alice.csrf, 'patch').expect(409);
  await mutate(alice.agent, `/api/v1/organizations/${org.id}/members/${bobId}`, { role: 'owner' }, alice.csrf, 'patch').expect(200);
  const results = await Promise.all([[alice, aliceId], [bob, bobId]].map(([user, id]: any) => mutate(user.agent, `/api/v1/organizations/${org.id}/members/${id}`, { role: 'editor' }, user.csrf, 'patch')));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await source.query(`SELECT count(*) FROM organization_memberships WHERE organization_id=$1 AND role='owner'`, [org.id]))[0].count, '1');
  await assert.rejects(source.query(`UPDATE organization_memberships SET role='viewer' WHERE organization_id=$1 AND role='owner'`, [org.id]), (error: any) => error.driverError?.code === '23514');
}));
test('platform admin requires explicit operator grant and does not bypass tenant member access', async () => fixture(async ({ login, mutate, source }: any) => {
  const admin = await login(); const owner = await login();
  const org = (await mutate(owner.agent, '/api/v1/organizations', { name: 'FICTIONAL private' }, owner.csrf)).body.data;
  await admin.agent.get('/api/v1/platform/organizations').expect(403);
  await source.query(`UPDATE users SET platform_role='platform_admin' WHERE id=$1`, [admin.me.user.id]);
  assert.equal((await admin.agent.get('/api/v1/platform/organizations').expect(200)).body.data.length, 1);
  await admin.agent.get(`/api/v1/organizations/${org.id}/members`).expect(404);
  await source.query(`UPDATE users SET status='suspended' WHERE id=$1`, [admin.me.user.id]);
  await admin.agent.get('/api/v1/platform/organizations').expect(401);
}));
test('append-only audit, foreign keys, uniqueness, JSON bounds and rate limits are enforced', async () => fixture(async ({ login, mutate, source, server }: any) => {
  const user = await login(); const org = (await mutate(user.agent, '/api/v1/organizations', { name: 'FICTIONAL audit' }, user.csrf)).body.data;
  const entries = (await user.agent.get(`/api/v1/organizations/${org.id}/audit`).expect(200)).body.data;
  assert.equal(entries[0].action, 'organization.created');
  await assert.rejects(source.query('UPDATE security_audit_logs SET action=action'), (error: any) => error.driverError?.code === '42501');
  await assert.rejects(source.query('DELETE FROM security_audit_logs'), (error: any) => error.driverError?.code === '42501');
  await assert.rejects(source.query(`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'viewer')`, [org.id, user.me.user.id]), (error: any) => error.driverError?.code === '23505');
  await assert.rejects(source.query(`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'viewer')`, [randomUUID(), user.me.user.id]), (error: any) => error.driverError?.code === '23503');
  await request(server).post('/api/v1/auth/verify').set('Content-Type', 'application/json').send('{' ).expect(400);
  await request(server).post('/api/v1/auth/verify').send({ message: 'x'.repeat(20000) }).expect(413);
  const wallet = Wallet.createRandom();
  for (let i = 0; i < 19; i++) await mutate(request(server), '/api/v1/auth/nonce', { address: wallet.address, chainId: 31337 }).expect(201);
  await mutate(request(server), '/api/v1/auth/nonce', { address: wallet.address, chainId: 31337 }).expect(429);
}));
