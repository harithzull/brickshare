import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexerSettings } from '../src/indexer/config';
import { decodeLogs, project } from '../src/indexer/projection';
import { LocalRpc } from '../src/indexer/rpc';
import { verifyTarget } from '../src/indexer/identity';
import { freshness } from '../src/indexer/synchronization.module';
import { buyer, FakeChain, owner, recipient } from './indexer.fixture';

test('indexer settings permit only local non-production Hardhat and bounded numeric settings', () => {
  assert.equal(indexerSettings({}).batchSize, 25);
  for (const config of [{ INDEXER_RPC_URL: 'https://sepolia.base.org' }, { INDEXER_RPC_URL: 'http://localhost@evil.test' }, { INDEXER_RPC_URL: 'http://127.0.0.1?key=secret' }, { INDEXER_CHAIN_ID: '84532' }, { NODE_ENV: 'production' }, { INDEXER_BATCH_SIZE: 0 }, { INDEXER_ALLOW_LOCAL_REBIND: 'yes' }, { INDEXER_POLL_MS: '1.2' }]) assert.throws(() => indexerSettings(config));
});
test('RPC client rejects transaction submission and chain mutation methods', async () => {
  const rpc = new LocalRpc('http://127.0.0.1:1', 100);
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'hardhat_reset', 'evm_mine', 'personal_sign']) await assert.rejects(rpc.request(method, []), /rpc_method_forbidden/);
});
test('deployment verification checks receipt, runtime bytecode and chain identity', async () => {
  const rpc = new FakeChain();
  const verified = await verifyTarget(rpc, rpc.target);
  assert.equal(verified.runId, rpc.runId);
  rpc.code = '0x6001'; await assert.rejects(verifyTarget(rpc, rpc.target), /deployment_invalid/);
  rpc.code = '0x6000'; rpc.chainId = '0x1'; await assert.rejects(verifyTarget(rpc, rpc.target), /wrong_chain/);
  rpc.chainId = '0x7a69'; await assert.rejects(verifyTarget(rpc, { ...rpc.target, transactionHash: '0x' + 'ff'.repeat(32) }), /deployment_invalid/);
});
test('event replay preserves exact purchase math, self-transfers, status and withdrawal semantics', () => {
  const chain = new FakeChain();
  chain.addBlock([['PropertyCreated', [1n, 'Test', 'Local', 1000n, 10000000000000001n]]]);
  chain.addBlock([['TokensPurchased', [1n, buyer, 3n, 30000000000000003n]]]);
  chain.addBlock([['TokensTransferred', [1n, buyer, buyer, 1n]], ['TokensTransferred', [1n, buyer, recipient, 2n]], ['PropertyStatusChanged', [1n, false]], ['FundsWithdrawn', [owner, 30000000000000003n]]]);
  const events = decodeLogs(chain.target.abi, chain.target.address, chain.logs, 100);
  const state = project(events, owner, 100);
  const p = state.properties.get('1')!;
  assert.equal(p.available, 997n); assert.equal(p.price, 10000000000000001n);
  assert.equal(p.holders.get(buyer), 1n); assert.equal(p.holders.get(recipient), 2n); assert.equal(p.holders.has(owner), false);
  assert.equal(p.active, false); assert.equal(state.treasury, 0n);
});
test('duplicate log delivery is deduplicated; conflicting logs and resource overflow fail closed', () => {
  const chain = new FakeChain(); chain.addBlock([['PropertyCreated', [1n, 'Test', 'Local', 1000n, 1n]]]);
  assert.equal(decodeLogs(chain.target.abi, chain.target.address, [...chain.logs, ...chain.logs], 100).length, 1);
  assert.throws(() => decodeLogs(chain.target.abi, chain.target.address, [...chain.logs, { ...chain.logs[0], transactionHash: '0x' + 'ee'.repeat(32) }], 100), /conflicting_event/);
  assert.throws(() => decodeLogs(chain.target.abi, chain.target.address, chain.logs, 0), /resource_limit/);
  assert.throws(() => project(decodeLogs(chain.target.abi, chain.target.address, chain.logs, 100), owner, 0), /resource_limit/);
});
test('freshness never describes an old heartbeat, error or invalidated chain as current', () => {
  assert.equal(freshness(null, 'initializing', 30000, 50000), 'never_synced');
  assert.equal(freshness(new Date(0), 'synced', 30000, 50000), 'stale');
  assert.equal(freshness(new Date(40000), 'synced', 30000, 50000), 'recently_checked');
  assert.equal(freshness(new Date(40000), 'error', 30000, 50000), 'degraded');
  assert.equal(freshness(new Date(40000), 'invalidated', 30000, 50000), 'invalidated');
});
