import { ethers } from 'ethers';
import { ApiClient, apiSettings } from '../src/lib/api-client.ts';

export const deploymentId = '11111111-1111-4111-8111-111111111111';
export const instanceId = '22222222-2222-4222-8222-222222222222';
export const propertyId = '33333333-3333-4333-8333-333333333333';
export const contractAddress = '0x1111111111111111111111111111111111111111';
export const hex = char => '0x' + char.repeat(64);
export const chain = { chainId: '31337', address: contractAddress, deploymentBlock: 1 };
export const codeHash = code => ethers.utils.keccak256(code);
export function fixture() {
  const sync = {
    deploymentId, instanceId, chainId: '31337', contractAddress, active: true, status: 'synced', freshness: 'recently_checked',
    indexedBlock: '12', indexedBlockHash: hex('a'), observedHead: '12', observedLag: '0',
    lastAttemptAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), finalityPolicy: 'local-latest-unfinalized', errorCode: null, reorgCount: 0, revision: '4',
    provenance: { receiptAndRuntimeVerifiedAtImport: true, abiHash: hex('b'), runtimeHash: codeHash('0x6000'), deploymentBlock: '1', deploymentBlockHash: hex('c'), transactionHash: hex('d'), releaseReference: null, hardhatInstanceId: hex('e'), genesisHash: hex('f') },
  };
  const record = {
    id: propertyId, source: 'blockchain', isFictional: false, fixtureLabel: null,
    blockchain: { source: 'reconciled_local_chain_snapshot', verifiedByApi: true, deploymentInstanceId: instanceId, synchronization: sync, deploymentId, chainId: '31337', contractAddress, onChainId: '1', name: 'Indexed name', location: 'Indexed location', totalTokens: '50', availableTokens: '10', tokenPriceWei: '1', active: false, observedBlock: '12', observedBlockHash: hex('a') },
    metadata: { source: 'operator_metadata', version: 2, title: 'Operator title', location: 'Operator location', description: 'Published description', publicationState: 'published', updatedAt: new Date().toISOString(), assets: [
      { id: '44444444-4444-4444-8444-444444444444', kind: 'image', mimeType: 'image/png', byteSize: '123', sha256: hex('1'), purpose: 'hero', altText: 'House exterior', caption: 'Operator supplied photo', url: 'https://cdn.example.test/house.png', availability: 'configured_external_reference' },
      { id: '55555555-5555-4555-8555-555555555555', kind: 'document', mimeType: 'application/pdf', byteSize: '456', sha256: hex('2'), purpose: 'supporting_document', altText: null, caption: 'Published overview', url: 'https://cdn.example.test/overview.pdf', availability: 'configured_external_reference' },
    ] },
  };
  const rpcCalls = [];
  const rpc = {
    async getBlock(number) { rpcCalls.push(['getBlock', number]); const n = BigInt(number); return { hash: n === 0n ? hex('f') : n === 1n ? hex('c') : hex('a') }; },
    async getCode() { rpcCalls.push(['getCode']); return '0x6000'; },
    async getTransactionReceipt() { rpcCalls.push(['receipt']); return { status: 1, blockNumber: 1, blockHash: hex('c'), contractAddress }; },
    async send(method) { rpcCalls.push([method]); return { chainId: 31337, instanceId: hex('e') }; },
  };
  const requests = [];
  const state = { sync, rows: [record], networks: [{ id: deploymentId, chainId: '31337', name: 'Hardhat Local', explorerUrl: null }], rpc, rpcCalls, requests, detail: null, override: null };
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    if (state.override) { const response = await state.override(url, options); if (response) return response; }
    const parsed = new URL(url); let body;
    const synchronization = { mode: 'local_read_only', authority: 'smart_contract', data: state.sync ? [state.sync] : [] };
    if (parsed.pathname === '/api/v1/networks') body = { data: state.networks, meta: { source: 'database_configuration', synchronizationStatusUrl: '/api/v1/synchronization' } };
    else if (parsed.pathname === '/api/v1/synchronization') body = synchronization;
    else if (parsed.pathname === '/api/v1/properties') {
      const page = Number(parsed.searchParams.get('page') || 1); const limit = Number(parsed.searchParams.get('limit') || 20);
      body = { data: state.rows.slice((page - 1) * limit, page * limit), meta: { source: 'blockchain', synchronization, page, limit, total: state.rows.length } };
    } else body = { data: state.detail || state.rows.find(row => row.id === parsed.pathname.split('/').at(-1)), meta: { source: 'blockchain', synchronization } };
    return json(body);
  };
  state.client = new ApiClient(apiSettings({ VITE_API_BASE_URL: 'http://127.0.0.1:3001', VITE_API_TIMEOUT_MS: '100' }), fetcher);
  return state;
}
export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export function rpcListing(extra = {}) {
  return { id: '1', name: 'Authoritative contract name', location: 'Contract City', total: '1000', available: '997', priceWei: ethers.utils.parseEther('0.01'), priceEth: '0.01', mine: '3', active: true, sample: false, documents: [], ...extra };
}
