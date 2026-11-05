import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { fixture, rpcListing, chain, codeHash, hex, contractAddress } from './api.fixture.mjs';

let vite; let useIndexedMetadata; let useBrickShare; let MetadataServiceStatus; let PropertyMetadataStatus;
before(async () => {
  const abi = JSON.parse(readFileSync(new URL('../src/generated/RealEstateTokenization.abi.json', import.meta.url), 'utf8'));
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, envFile: false, logLevel: 'silent', esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, watch: null }, plugins: [{
    name: 'wallet-test-boundary', enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.replaceAll('\\', '/').endsWith('/hooks/useBrickShare.js')) {
        if (source === './useMarketplace') return '\0wallet-test-market';
        if (source === '../config') return '\0wallet-test-config';
      }
    },
    load(id) {
      if (id === '\0wallet-test-market') return 'export default function useMarketplace() { return globalThis.__brickShareTestMarket; }';
      if (id === '\0wallet-test-config') return `export const CONTRACT_ADDRESS=${JSON.stringify(contractAddress)}; export const CONTRACT_ABI=${JSON.stringify(abi)}; export const EXPECTED_CHAIN_ID=31337; export const NETWORK_NAMES={31337:'Hardhat Local'}; export const WALLET_NETWORK={chainId:'0x7a69'};`;
    },
  }] });
  useIndexedMetadata = (await vite.ssrLoadModule('/src/hooks/useIndexedMetadata.js')).default;
  useBrickShare = (await vite.ssrLoadModule('/src/hooks/useBrickShare.js')).default;
  MetadataServiceStatus = (await vite.ssrLoadModule('/src/components/MetadataServiceStatus.jsx')).default;
  PropertyMetadataStatus = (await vite.ssrLoadModule('/src/components/PropertyMetadataStatus.jsx')).default;
});
after(async () => { await vite?.close(); delete globalThis.window; delete globalThis.__brickShareTestMarket; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settle(check) { for (let i = 0; i < 100; i++) { await act(async () => { await delay(10); }); if (check()) return; } assert.fail('Hook did not settle'); }

test('React displays RPC listings immediately while metadata is pending, then handles timeout independently', async () => {
  const f = fixture(); f.override = () => new Promise(() => {});
  const listings = [rpcListing()]; let result;
  function Probe() { result = useIndexedMetadata({ listings, ready: true, rpc: f.rpc, chain, client: f.client, codeHash }); return null; }
  let renderer; await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  try {
    assert.equal(result.properties[0].available, '997'); assert.equal(result.properties[0].priceEth, '0.01');
    assert.equal(result.metadata.loading, true);
    await settle(() => result.metadata.state === 'unavailable');
    assert.equal(result.properties[0].sample, false); assert.equal(result.properties[0].mine, '3');
  } finally { await act(async () => renderer.unmount()); }
});
test('React cancels obsolete metadata on context changes and sample mode does not fetch API data', async () => {
  const f1 = fixture(); f1.override = () => new Promise(() => {});
  const f2 = fixture(); f2.rows[0].blockchain.onChainId = '2'; f2.rows[0].metadata.description = 'Second property metadata';
  let props = { listings: [rpcListing()], ready: true, rpc: f1.rpc, chain, client: f1.client, codeHash }; let result;
  function Probe() { result = useIndexedMetadata(props); return null; }
  let renderer; await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  try {
    props = { ...props, listings: [rpcListing({ id: '2' })], rpc: f2.rpc, client: f2.client };
    await act(async () => renderer.update(React.createElement(Probe)));
    await settle(() => result.metadata.state === 'ready');
    assert.equal(result.properties[0].id, '2'); assert.equal(result.properties[0].description, 'Second property metadata');
    assert.ok(f1.requests.every(request => request.options.signal.aborted));
    const f3 = fixture(); props = { ...props, ready: false, client: f3.client, rpc: f3.rpc, listings: [rpcListing({ sample: true })] };
    await act(async () => renderer.update(React.createElement(Probe)));
    assert.equal(f3.requests.length, 0); assert.equal(result.properties[0].description, undefined);
  } finally { await act(async () => renderer.unmount()); }
});
test('React expires previously accepted metadata while the user stays on the page', async () => {
  const f = fixture(); const listings = [rpcListing()]; let time = Date.now(); const now = () => time; let result;
  function Probe() { result = useIndexedMetadata({ listings, ready: true, rpc: f.rpc, chain, client: f.client, codeHash, now }); return null; }
  let renderer; await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  try {
    await settle(() => result.metadata.state === 'ready'); assert.equal(result.properties[0].description, 'Published description');
    time += 60000; await act(async () => { await delay(1100); });
    assert.equal(result.metadata.state, 'stale'); assert.equal(result.properties[0].description, undefined);
  } finally { await act(async () => renderer.unmount()); }
});
test('source indicators explain RPC fallback and render operator text without HTML injection', async () => {
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(MetadataServiceStatus, { metadata: { state: 'unavailable', message: 'Metadata unavailable; blockchain RPC remains available.', refresh() {} }, readAt: new Date().toISOString() })); });
  try {
    const body = JSON.stringify(renderer.toJSON()); assert.match(body, /Blockchain browsing available/); assert.match(body, /last read/); assert.match(body, /Retry metadata/);
    await act(async () => renderer.update(React.createElement(PropertyMetadataStatus, { detailed: true, property: { sample: false, metadataInfo: { source: 'api', version: 2, indexedBlock: '12', title: '<script>bad()</script>', unavailableAssets: 1 } } })));
    assert.match(JSON.stringify(renderer.toJSON()), /unfinalized/);
    assert.equal(renderer.root.findAllByType('script').length, 0); assert.equal(renderer.root.findAll(node => node.props.dangerouslySetInnerHTML).length, 0);
  } finally { await act(async () => renderer.unmount()); }
});

test('existing wallet purchase review and signing work during an API outage with RPC-based payment', async () => {
  const account = '0x2222222222222222222222222222222222222222';
  const calls = []; let sent; let refreshes = 0; let app;
  const txHash = hex('1'); const blockHash = hex('2');
  const block = { hash: blockHash, parentHash: hex('3'), number: '0x2', timestamp: '0x6553f100', nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x1c9c380', gasUsed: '0x5208', miner: '0x0000000000000000000000000000000000000000', extraData: '0x', transactions: [], baseFeePerGas: '0x3b9aca00' };
  const ethereum = {
    on() {}, removeListener() {},
    async request({ method, params = [] }) {
      calls.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
      if (method === 'eth_chainId') return '0x7a69';
      if (method === 'net_version') return '31337';
      if (method === 'eth_getBalance') return ethers.utils.parseEther('1000').toHexString();
      if (method === 'eth_gasPrice') return '0x3b9aca00';
      if (method === 'eth_estimateGas') return '0x5208';
      if (method === 'eth_getBlockByNumber') return block;
      if (method === 'eth_blockNumber') return '0x2';
      if (method === 'eth_sendTransaction') { sent = params[0]; return txHash; }
      if (method === 'eth_getTransactionByHash') return { hash: txHash, from: account, to: contractAddress, nonce: '0x0', gas: sent.gas, gasPrice: '0x3b9aca00', value: sent.value, input: sent.data, chainId: '0x7a69', blockNumber: '0x2', blockHash, transactionIndex: '0x0', v: '0xf4f5', r: hex('4'), s: hex('5'), type: '0x0' };
      if (method === 'eth_getTransactionReceipt') return { to: contractAddress, from: account, contractAddress: null, transactionIndex: '0x0', gasUsed: '0x5208', logsBloom: '0x' + '0'.repeat(512), blockHash, transactionHash: txHash, logs: [], blockNumber: '0x2', cumulativeGasUsed: '0x5208', status: '0x1', effectiveGasPrice: '0x3b9aca00', type: '0x0' };
      throw new Error(`Unexpected wallet method ${method}`);
    },
  };
  globalThis.window = { ethereum };
  globalThis.__brickShareTestMarket = { status: 'ready', refreshing: false, owner: account, properties: [rpcListing()], metadata: { state: 'unavailable' }, refresh: async () => { refreshes++; } };
  function Probe() { app = useBrickShare({ mode: 'live', propertyId: '1' }); return null; }
  let renderer; await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  try {
    await act(async () => { await app.connect(); }); assert.equal(app.wallet.account.toLowerCase(), account);
    await act(async () => { await app.buy(app.market.properties[0], '3'); });
    assert.equal(app.quote.value.toString(), '30000000000000000'); assert.equal(app.notice, null);
    assert.equal(calls.includes('eth_sendTransaction'), false);
    await act(async () => { await app.confirm(); });
    assert.equal(app.tx.status, 'success'); assert.equal(refreshes, 1);
    assert.equal(ethers.BigNumber.from(sent.value).toString(), '30000000000000000');
    assert.equal(sent.to.toLowerCase(), contractAddress);
    assert.equal(calls.filter(method => method === 'eth_sendTransaction').length, 1);
  } finally { await act(async () => renderer.unmount()); delete globalThis.window; delete globalThis.__brickShareTestMarket; }
});
