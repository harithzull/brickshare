import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SiweMessage } from 'siwe';
import { Wallet } from 'ethers';
import { validateEnvironment } from '../src/config/environment';
import { addressBytes, cookieName, cookieOptions, digest, equalHash, readCookie, requireBrowserMutation, secret, sessionCsrf } from '../src/auth/security';
import { loginStatement } from '../src/auth/auth.service';
import { permissions } from '../src/organizations/organizations.service';
import { Request } from 'express';

const input = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:unit-only@127.0.0.1/brickshare_test' };
test('auth configuration binds exact origins, allowed chains and production cookie requirements', () => {
  assert.equal(validateEnvironment(input).AUTH_ORIGIN, 'http://127.0.0.1:5173');
  for (const patch of [{ AUTH_ORIGIN: 'https://evil.test' }, { AUTH_ORIGIN: 'http://127.0.0.1:5173/path' }, { AUTH_CHAIN_IDS: '1' }, { AUTH_SESSION_TTL_SECONDS: 0 }, { AUTH_COOKIE_SECURE: 'yes' }]) assert.throws(() => validateEnvironment({ ...input, ...patch }));
  const secure = validateEnvironment({ ...input, NODE_ENV: 'production', DATABASE_SSL: true, AUTH_COOKIE_SECURE: true, AUTH_ORIGIN: 'https://brickshare.example', CORS_ORIGINS: 'https://brickshare.example' });
  assert.equal(cookieOptions(secure).secure, true); assert.match(cookieName(secure, 'session'), /^__Host-/);
  assert.throws(() => validateEnvironment({ ...secure, ALLOW_LOCAL_ADMIN_BOOTSTRAP: true }));
});
test('opaque tokens and CSRF are unique, fixed size, hash-only and context separated', () => {
  const one = secret(); const two = secret(); assert.notEqual(one, two); assert.equal(one.length, 43);
  assert.equal(digest(one).length, 32); assert.notEqual(sessionCsrf(one), one); assert.notEqual(sessionCsrf(one), sessionCsrf(two));
  assert.equal(equalHash(one, digest(one)), true); assert.equal(equalHash(two, digest(one)), false);
  const env = validateEnvironment(input); assert.deepEqual(cookieOptions(env), { httpOnly: true, sameSite: 'strict', secure: false, path: '/' });
  assert.equal(readCookie({ headers: { cookie: `brickshare_session=${one}; brickshare_session=${two}` } } as Request, 'brickshare_session'), undefined);
  assert.throws(() => addressBytes('0x' + '00'.repeat(20)));
});
test('SIWE maintained library verifies EOA signatures without a provider and rejects a different signer', async () => {
  const wallet = Wallet.createRandom(); const attacker = Wallet.createRandom();
  const message = new SiweMessage({ domain: '127.0.0.1:5173', scheme: 'http', address: wallet.address, statement: loginStatement, uri: 'http://127.0.0.1:5173/', version: '1', chainId: 31337, nonce: 'abcd1234abcd1234', issuedAt: new Date().toISOString(), expirationTime: new Date(Date.now() + 300000).toISOString() });
  const signed = message.prepareMessage();
  assert.equal((await message.verify({ signature: await wallet.signMessage(signed), domain: '127.0.0.1:5173', nonce: message.nonce }, { suppressExceptions: true })).success, true);
  assert.equal((await message.verify({ signature: await attacker.signMessage(signed) }, { suppressExceptions: true })).success, false);
});
test('mutation boundary requires exact Origin, custom header, JSON and non-cross-site browser context', () => {
  const env = validateEnvironment(input);
  const valid = { headers: { origin: env.AUTH_ORIGIN, 'x-brickshare-auth': '1' }, is: () => 'application/json' } as unknown as Request;
  assert.doesNotThrow(() => requireBrowserMutation(valid, env));
  for (const headers of [{ origin: 'https://evil.test' }, {}, { ...valid.headers, 'sec-fetch-site': 'cross-site' }]) assert.throws(() => requireBrowserMutation({ ...valid, headers } as Request, env));
});
test('organization roles never imply platform-admin or Solidity authority', () => {
  assert.equal(permissions('owner').manageMembers, true); assert.equal(permissions('editor').editOrganization, true);
  assert.equal(permissions('editor').manageMembers, false); assert.equal(permissions('viewer').editOrganization, false);
  assert.equal('platformRole' in permissions('owner'), false); assert.equal('buyTokens' in permissions('owner'), false);
});
