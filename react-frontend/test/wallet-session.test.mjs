import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

let vite; let useWalletSession; let OrganizationsPage;
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, envFile: false, logLevel: 'silent', esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, watch: null } });
  useWalletSession = (await vite.ssrLoadModule('/src/hooks/useWalletSession.js')).default;
  OrganizationsPage = (await vite.ssrLoadModule('/src/pages/OrganizationsPage.jsx')).default;
});
after(async () => vite?.close());
const address = '0x1111111111111111111111111111111111111111';
const session = () => ({ authenticated: true, user: { id: 'test-user', platformRole: 'investor' }, wallet: { address, chainId: '31337' }, expiresAt: new Date(Date.now() + 3600000).toISOString() });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(run, initial = { authenticated: false }) {
  let stored = initial; let result; const calls = []; const listeners = new Map();
  const ethereum = { request: async ({ method }) => { calls.push(method); return method === 'eth_accounts' ? [address] : '0x7a69'; }, on: (event, listener) => listeners.set(event, listener), removeListener: event => listeners.delete(event) };
  const client = { settings: { baseUrl: 'http://127.0.0.1:3001' }, me: async () => stored, nonce: async () => ({ message: 'validated SIWE message' }), verify: async () => { stored = session(); }, logout: async () => { calls.push('logout'); stored = { authenticated: false }; } };
  const wallet = { account: address, provider: { getNetwork: async () => ({ chainId: 31337 }) }, signer: { signMessage: async text => { calls.push(text); return '0xsignature'; }, sendTransaction: () => assert.fail('Login must never send a transaction') } };
  function Probe() { result = useWalletSession({ client, wallet, expectedChainId: 31337, ethereum }); return null; }
  let renderer; await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); await delay(5); });
  try { await run({ get result() { return result; }, client, wallet, calls, listeners, ethereum, setStored(value) { stored = value; } }); }
  finally { await act(async () => renderer.unmount()); }
}
test('session restoration is silent; explicit sign-in signs one message and logout clears application permissions', async () => {
  await fixture(async f => {
    assert.equal(f.result.status, 'anonymous'); assert.equal(f.calls.length, 0);
    await act(async () => f.result.signIn());
    assert.equal(f.result.status, 'signed_in'); assert.equal(f.calls.filter(c => c === 'validated SIWE message').length, 1);
    assert.equal(f.calls.includes('eth_requestAccounts'), false);
    await act(async () => f.result.logout()); assert.equal(f.result.session, null);
  });
  await fixture(async f => { assert.equal(f.result.status, 'signed_in'); assert.equal(f.calls.includes('validated SIWE message'), false); }, session());
});
test('account and network events revoke local authorization and obsolete responses cannot restore it', async () => {
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) await fixture(async f => {
    let resolve; f.client.me = () => new Promise(r => { resolve = r; });
    let pending; await act(async () => { pending = f.result.refresh(); });
    await act(async () => { f.listeners.get(event)(); await delay(1); });
    assert.equal(f.result.session, null); assert.ok(f.calls.includes('logout'));
    await act(async () => { resolve(session()); await pending; }); assert.equal(f.result.session, null);
  }, session());
});
test('signature rejection and API failure do not change the connected wallet or send transactions', async () => fixture(async f => {
  f.wallet.signer.signMessage = async () => { throw Object.assign(new Error('Rejected'), { code: 4001 }); };
  await act(async () => f.result.signIn()); assert.equal(f.result.session, null); assert.match(f.result.error, /cancelled/);
  f.client.nonce = async () => { throw new Error('API unavailable'); };
  await act(async () => f.result.signIn()); assert.match(f.result.error, /API unavailable/); assert.equal(f.result.busy, false); assert.equal(f.wallet.account, address);
}));
test('session expiration clears permissions while the page stays open', async () => fixture(async f => {
  await act(async () => { await delay(1100); }); assert.equal(f.result.session, null); assert.ok(f.calls.includes('logout'));
}, { ...session(), expiresAt: new Date(Date.now() + 700).toISOString() }));

test('network change during final wallet validation cannot resurrect a newly verified session', async () => fixture(async f => {
  let release; let checks = 0;
  const original = f.ethereum.request;
  f.ethereum.request = async args => {
    if (args.method === 'eth_accounts' && ++checks === 3) return new Promise(resolve => { release = resolve; });
    return original(args);
  };
  let pending; await act(async () => { pending = f.result.signIn(); await delay(10); });
  assert.equal(typeof release, 'function');
  await act(async () => { f.listeners.get('chainChanged')(); await delay(1); });
  await act(async () => { release([address]); await pending; });
  assert.equal(f.result.session, null); assert.ok(f.calls.includes('logout'));
}));

test('organization navigation is private and owner controls are hidden for viewers', async () => {
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(OrganizationsPage, { auth: { session: null } })); });
  assert.match(JSON.stringify(renderer.toJSON()), /Sign in to view organizations/);
  await act(async () => renderer.unmount());
  for (const role of ['viewer', 'owner']) {
    const org = { id: 'organization-id', name: 'FICTIONAL Studio', role, permissions: { editOrganization: role === 'owner', manageMembers: role === 'owner', manageInvitations: role === 'owner', readAudit: role === 'owner' } };
    const client = { organizations: async () => ({ data: [org] }), inbox: async () => ({ data: [] }), members: async () => ({ organization: org, data: [] }), invitations: async () => ({ data: [] }), audit: async () => ({ data: [] }) };
    await act(async () => { renderer = TestRenderer.create(React.createElement(OrganizationsPage, { auth: { session: session(), client } })); await delay(20); });
    await act(async () => { await delay(10); });
    const text = JSON.stringify(renderer.toJSON());
    assert.equal(text.includes('Invite a wallet'), role === 'owner'); assert.equal(text.includes('Save name'), role === 'owner');
    await act(async () => renderer.unmount());
  }
});
