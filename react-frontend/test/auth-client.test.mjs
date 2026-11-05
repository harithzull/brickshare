import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SiweMessage } from 'siwe';
import { AuthClient, assertLoginMessage } from '../src/lib/api-auth.ts';

const origin = 'http://127.0.0.1:5173';
const address = '0x1111111111111111111111111111111111111111';
const settings = { baseUrl: 'http://127.0.0.1:3001', timeoutMs: 25 };
function challenge(patch = {}) {
  const issuedAt = new Date().toISOString(); const expiresAt = new Date(Date.now() + 300000).toISOString(); const challengeId = randomUUID(); const nonce = 'a'.repeat(64);
  const message = new SiweMessage({ scheme: 'http', domain: '127.0.0.1:5173', address, uri: origin + '/', version: '1', chainId: 31337, nonce, requestId: challengeId, issuedAt, expirationTime: expiresAt, statement: 'Sign in to BrickShare. This verifies wallet control for an application session. It is not a blockchain transaction, payment, or property ownership proof.', ...patch }).prepareMessage();
  return { message, challengeId, nonce, issuedAt, expiresAt, csrfToken: 'b'.repeat(43) };
}
const session = () => ({ authenticated: true, user: { id: randomUUID(), displayName: null, platformRole: 'investor' }, wallet: { address, chainId: '31337', kind: 'EOA' }, csrfToken: 'c'.repeat(43), expiresAt: new Date(Date.now() + 3600000).toISOString() });
test('private client binds SIWE to the site and uses cookie credentials and distinct challenge/session CSRF', async () => {
  const calls = []; const n = challenge(); const me = session();
  const client = new AuthClient(settings, origin, async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/nonce') ? n : url.endsWith('/verify') ? { authenticated: true, expiresAt: me.expiresAt } : url.endsWith('/logout') ? { authenticated: false } : me);
  });
  await client.nonce(address, 31337); await client.verify(n, '0xsignature'); await client.me(); await client.logout();
  assert.ok(calls.every(c => c.options.credentials === 'include' && c.options.cache === 'no-store' && c.options.redirect === 'error'));
  assert.equal(calls[1].options.headers['X-CSRF-Token'], n.csrfToken);
  assert.equal(calls[3].options.headers['X-CSRF-Token'], me.csrfToken);
  assert.ok(calls.every(c => c.options.headers['X-BrickShare-Auth'] === '1'));
});
test('message domain, URI, chain, wallet, statement and expiration are checked before wallet signing', async () => {
  await assertLoginMessage(challenge(), origin, address, 31337);
  for (const patch of [{ domain: 'evil.example' }, { uri: 'https://evil.example/' }, { chainId: 84532 }, { address: '0x2222222222222222222222222222222222222222' }, { statement: 'Send all assets' }, { expirationTime: new Date(Date.now() - 1).toISOString() }]) {
    await assert.rejects(assertLoginMessage(challenge(patch), origin, address, 31337), e => e.code === 'siwe_message');
  }
});
test('host mismatches, timeout, cancellation, malformed responses and HTTP errors fail closed', async () => {
  let calls = 0;
  const mismatch = new AuthClient(settings, 'http://localhost:5173', async () => { calls++; });
  await assert.rejects(mismatch.me(), e => e.code === 'cookie_site'); assert.equal(calls, 0);
  await assert.rejects(new AuthClient(settings, origin, () => new Promise(() => {})).me(), e => e.code === 'timeout');
  const abort = new AbortController(); abort.abort();
  await assert.rejects(new AuthClient(settings, origin).me(abort.signal), e => e.code === 'aborted');
  await assert.rejects(new AuthClient(settings, origin, async () => Response.json({ authenticated: true })).me(), e => e.code === 'auth_response');
  for (const status of [401, 403, 404, 409, 429, 503]) await assert.rejects(new AuthClient(settings, origin, async () => Response.json({ secret: 'must not display' }, { status })).me(), e => e.status === status && !e.message.includes('must not display'));
});
