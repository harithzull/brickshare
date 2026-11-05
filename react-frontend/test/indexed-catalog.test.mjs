import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIndexedCatalog, mergeIndexedCatalog, integrationFailure, fallback } from '../src/lib/indexed-catalog.ts';
import { purchaseCost, readProperties } from '../src/lib/marketplace.js';
import { fixture, chain, codeHash, rpcListing, hex, propertyId, json } from './api.fixture.mjs';

const load = (f, options = {}) => loadIndexedCatalog({ client: f.client, chain, rpc: f.rpc, codeHash, ...options });
test('matched API listings and detail enrich published presentation fields while RPC financial fields remain exact', async () => {
  const f = fixture(); const result = await load(f, { selectedId: '1' });
  const listing = rpcListing(); const [merged] = mergeIndexedCatalog([listing], result, 30000);
  assert.equal(merged.description, 'Published description'); assert.equal(merged.image, 'https://cdn.example.test/house.png'); assert.equal(merged.documents[0].title, 'Published overview');
  assert.equal(merged.metadataInfo.version, 2); assert.equal(merged.metadataInfo.source, 'api');
  for (const field of ['id', 'name', 'location', 'total', 'available', 'priceWei', 'priceEth', 'mine', 'active', 'sample']) assert.equal(merged[field], listing[field], field);
  assert.equal(purchaseCost(merged, '3').toString(), '30000000000000000');
  assert.ok(f.requests.some(request => request.url.includes('/properties/' + propertyId)));
  assert.ok(f.rpcCalls.every(([method]) => !/sign|sendTransaction/.test(method)));
});
test('matching never uses names and rejects chain, address, deployment, instance and duplicate mismatches', async () => {
  for (const mutate of [f => { f.rows[0].blockchain.chainId = '84532'; }, f => { f.rows[0].blockchain.contractAddress = '0x' + '9'.repeat(40); }, f => { f.rows[0].blockchain.deploymentId = '99999999-9999-4999-8999-999999999999'; }, f => { f.rows[0].blockchain.deploymentInstanceId = '99999999-9999-4999-8999-999999999999'; }, f => { f.rows.push(structuredClone(f.rows[0])); }]) {
    const f = fixture(); f.rows[0].blockchain.name = rpcListing().name; mutate(f);
    await assert.rejects(load(f), error => error.code === 'mismatch');
  }
  const f = fixture(); f.rows[0].blockchain.onChainId = '2';
  const [merged] = mergeIndexedCatalog([rpcListing()], await load(f), 30000);
  assert.equal(merged.description, undefined); assert.equal(merged.metadataInfo.status, 'not_indexed');
});
test('stopped, degraded, catching-up, invalidated and aged indexer data are withheld', async () => {
  for (const patch of [{ freshness: 'stale' }, { status: 'error', freshness: 'degraded' }, { status: 'syncing', freshness: 'catching_up', observedLag: '1' }, { lastSuccessAt: new Date(Date.now() - 120000).toISOString() }]) {
    const f = fixture(); Object.assign(f.sync, patch);
    await assert.rejects(load(f), error => error.code === 'stale');
  }
  const f = fixture(); f.sync.active = false; f.sync.status = 'invalidated';
  assert.equal((await load(f)).state, 'mismatch');
});
test('RPC block, receipt, runtime and Hardhat reset mismatch prevent metadata reuse', async () => {
  for (const mutate of [
    f => { f.rpc.getBlock = async () => ({ hash: hex('9') }); },
    f => { f.rpc.getTransactionReceipt = async () => null; },
    f => { f.rpc.getCode = async () => '0x6001'; },
    f => { f.rpc.send = async () => ({ chainId: 31337, instanceId: hex('9') }); },
    f => { delete f.sync.provenance.hardhatInstanceId; },
    f => { f.rows[0].blockchain.observedBlockHash = hex('9'); },
  ]) { const f = fixture(); mutate(f); await assert.rejects(load(f), error => error.code === 'mismatch'); }
});
test('API outage and timeout retain RPC catalog, holdings, calculations and safe local metadata', async () => {
  const f = fixture(); f.override = async () => json({ error: 'offline' }, 503);
  let state; try { await load(f); } catch (error) { state = integrationFailure(error); }
  const listing = rpcListing({ description: 'Local catalog fallback' });
  const [merged] = mergeIndexedCatalog([listing], state, 30000);
  assert.equal(merged.description, 'Local catalog fallback'); assert.equal(merged.metadataInfo.source, 'local'); assert.equal(merged.sample, false);
  assert.equal(purchaseCost(merged, '3').toString(), '30000000000000000'); assert.equal(merged.mine, '3');
  f.override = () => new Promise(() => {});
  await assert.rejects(load(f), error => error.code === 'timeout');
});
test('missing publication, unindexed RPC properties and unsupported networks degrade independently', async () => {
  const f = fixture(); f.rows[0].metadata = null;
  const merged = mergeIndexedCatalog([rpcListing(), rpcListing({ id: '2' })], await load(f), 30000);
  assert.equal(merged[0].metadataInfo.status, 'not_published'); assert.equal(merged[1].metadataInfo.status, 'not_indexed'); assert.equal(merged.length, 2);
  f.sync = null; assert.equal((await load(f)).state, 'incomplete');
  f.networks = []; await assert.rejects(load(f), error => error.code === 'mismatch');
});
test('cached metadata expires without navigation and unsafe asset links never reach the UI', async () => {
  const f = fixture(); f.rows[0].metadata.assets[0].url = 'javascript:alert(1)'; f.rows[0].metadata.assets[1].url = null;
  const result = await load(f); const [merged] = mergeIndexedCatalog([rpcListing()], result, 30000);
  assert.equal(merged.image, undefined); assert.deepEqual(merged.documents, []); assert.equal(merged.metadataInfo.unavailableAssets, 2);
  const [expired] = mergeIndexedCatalog([rpcListing()], result, 30000, result.checkedAt + 60000);
  assert.equal(expired.description, undefined); assert.equal(expired.metadataInfo.status, 'stale');
});
test('bounded pagination loads full index and rejects changed totals or excessive catalogs', async () => {
  const f = fixture(); f.rows = Array.from({ length: 101 }, (_, index) => ({ ...structuredClone(f.rows[0]), id: `${String(index).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, blockchain: { ...structuredClone(f.rows[0].blockchain), onChainId: String(index + 1) } }));
  const result = await load(f); assert.equal(result.records.length, 101);
  assert.equal(f.requests.filter(request => new URL(request.url).pathname === '/api/v1/properties').length, 2);
  f.override = async url => new URL(url).pathname === '/api/v1/properties' ? json({ data: [], meta: { source: 'blockchain', synchronization: { mode: 'local_read_only', authority: 'smart_contract', data: [f.sync] }, page: 1, limit: 100, total: 1001 } }) : null;
  await assert.rejects(load(f), error => error.code === 'incomplete');
});
test('fictional API records are rejected and sample previews are never enriched with real API metadata', async () => {
  const f = fixture(); const result = await load(f);
  const [sample] = mergeIndexedCatalog([rpcListing({ sample: true })], result, 30000);
  assert.equal(sample.description, undefined); assert.equal(sample.metadataInfo.source, 'missing');
  f.rows[0].source = 'fictional'; f.rows[0].isFictional = true; f.rows[0].blockchain = null;
  await assert.rejects(load(f), error => error.code === 'mismatch');
});
test('RPC read fallback still enumerates actual contract data without reading wallet balances for visitors', async () => {
  const { ethers } = await import('ethers');
  const fake = { propertyCount: async () => ethers.BigNumber.from(1), getProperty: async () => [ethers.BigNumber.from(1), 'RPC listing', 'Local', ethers.BigNumber.from(1000), ethers.BigNumber.from(997), ethers.utils.parseEther('0.01'), true], getTokenBalance: () => { throw new Error('Unexpected wallet call'); } };
  const listings = await readProperties(fake, null);
  const [property] = mergeIndexedCatalog(listings, fallback('unavailable', 'API unavailable'), 30000);
  assert.equal(property.mine, '0'); assert.equal(property.name, 'RPC listing'); assert.equal(purchaseCost(property, '3').toString(), '30000000000000000');
});
