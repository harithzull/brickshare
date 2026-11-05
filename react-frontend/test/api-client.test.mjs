import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, ApiError, apiSettings } from '../src/lib/api-client.ts';
import { fixture, json, propertyId } from './api.fixture.mjs';

test('API configuration is opt-in and rejects credential URLs, query secrets, unsafe origins and invalid bounds', () => {
  assert.equal(apiSettings({}).baseUrl, null);
  assert.equal(apiSettings({ VITE_API_BASE_URL: 'http://localhost:3001/' }).baseUrl, 'http://localhost:3001');
  for (const value of ['http://evil.test', 'javascript:alert(1)', 'https://u:password@api.test', 'https://api.test?key=secret', 'https://api.test#secret']) assert.throws(() => apiSettings({ VITE_API_BASE_URL: value }), ApiError);
  assert.throws(() => apiSettings({ VITE_API_BASE_URL: 'http://localhost:3001' }, 'baseSepolia'));
  for (const value of ['0', '1.2', '10001']) assert.throws(() => apiSettings({ VITE_API_TIMEOUT_MS: value }));
});
test('typed client reads networks, synchronization, queries and property UUID detail without credentials', async () => {
  const f = fixture();
  assert.equal((await f.client.networks()).data[0].chainId, '31337');
  assert.equal((await f.client.synchronization()).data[0].indexedBlock, '12');
  assert.equal((await f.client.properties({ chainId: '31337', q: 'a&b', page: 1, limit: 100 })).data[0].metadata.version, 2);
  assert.equal((await f.client.property(propertyId)).data.id, propertyId);
  for (const request of f.requests) { assert.equal(request.options.method, 'GET'); assert.equal(request.options.credentials, 'omit'); assert.equal(request.options.cache, 'no-store'); assert.equal(request.options.redirect, 'error'); }
  const url = new URL(f.requests[2].url); assert.equal(url.searchParams.get('q'), 'a&b'); assert.equal(url.searchParams.get('source'), 'blockchain');
  assert.throws(() => f.client.property('not-a-uuid'), /UUID/);
  assert.throws(() => f.client.properties({ source: 'fictional' }), /Unsupported/);
});
test('HTTP, network, malformed JSON and incompatible API errors are meaningful and redacted', async () => {
  for (const [response, code] of [[json({ private: 'password' }, 503), 'http'], [json({}, 404), 'not_found'], [new Response('bad json', { headers: { 'Content-Type': 'application/json' } }), 'invalid_response'], [json({ data: [] }), 'invalid_response'], [new Response('<html>proxy error</html>'), 'invalid_response']]) {
    const client = new ApiClient(apiSettings({ VITE_API_BASE_URL: 'http://localhost:3001' }), async () => response);
    await assert.rejects(client.networks(), error => error.code === code && !error.message.includes('password'));
  }
  const client = new ApiClient(apiSettings({ VITE_API_BASE_URL: 'http://localhost:3001' }), async () => { throw new Error('private-connection-detail'); });
  await assert.rejects(client.networks(), error => error.code === 'network' && !error.message.includes('private-connection-detail'));
});
test('timeouts bound stalled requests and caller cancellation stops obsolete fetches', async () => {
  const client = new ApiClient(apiSettings({ VITE_API_BASE_URL: 'http://localhost:3001', VITE_API_TIMEOUT_MS: 100 }), () => new Promise(() => {}));
  await assert.rejects(client.networks(), error => error.code === 'timeout');
  const controller = new AbortController(); const pending = client.networks(controller.signal); controller.abort();
  await assert.rejects(pending, error => error.code === 'aborted');
  await assert.rejects(client.networks(controller.signal), error => error.code === 'aborted');
});
test('response validation preserves large decimal strings and rejects unpublished metadata or broken amounts', async () => {
  const f = fixture(); const max = ((1n << 256n) - 1n).toString();
  f.rows[0].blockchain.onChainId = max;
  assert.equal((await f.client.properties()).data[0].blockchain.onChainId, max);
  f.rows[0].metadata.publicationState = 'draft';
  await assert.rejects(f.client.properties(), error => error.code === 'invalid_response');
  f.rows[0].metadata.publicationState = 'published'; f.rows[0].blockchain.tokenPriceWei = 0.01;
  await assert.rejects(f.client.properties(), error => error.code === 'invalid_response');
});
