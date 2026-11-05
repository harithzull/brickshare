import { ApiClient, ApiError } from './api-client.ts';
import type { ApiProperty, SyncEntry } from './api-types.ts';

export interface ChainIdentity { chainId: string; address: string; deploymentBlock: number; }
export interface RpcIdentityReader {
  getBlock(block: number | string): Promise<{ hash: string } | null>;
  getCode(address: string): Promise<string>;
  getTransactionReceipt(hash: string): Promise<{ status: number; blockNumber: number; blockHash: string; contractAddress: string | null } | null>;
  send(method: string, params: unknown[]): Promise<unknown>;
}
export interface RpcListing {
  id: string; name: string; location: string; total: string; available: string;
  priceWei: { toString(): string }; active: boolean; sample?: boolean;
  description?: string; image?: string; imageAlt?: string; imageCaption?: string;
  documents?: Array<{ title: string; url: string }>;
}
export interface IndexedCatalog {
  state: 'ready' | 'incomplete' | 'stale' | 'mismatch' | 'unavailable' | 'loading' | 'disabled';
  message: string; records: ApiProperty[]; sync: SyncEntry | null; checkedAt: number;
}
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const identityMatches = (entry: { chainId: string; contractAddress: string }, chain: ChainIdentity) => entry.chainId === chain.chainId && same(entry.contractAddress, chain.address);
const failure = (code: string, message: string): never => { throw new ApiError(code, message); };
export function recent(entry: SyncEntry, maxAgeMs: number, now = Date.now()) {
  const success = entry.lastSuccessAt ? Date.parse(entry.lastSuccessAt) : NaN;
  return entry.active && entry.status === 'synced' && entry.freshness === 'recently_checked' && entry.observedLag === '0' && entry.indexedBlock !== null && entry.indexedBlockHash !== null && Number.isFinite(success) && success <= now + 5000 && now - success <= maxAgeMs;
}
export function fallback(state: IndexedCatalog['state'], message: string): IndexedCatalog { return { state, message, records: [], sync: null, checkedAt: Date.now() }; }
export function integrationFailure(error: unknown): IndexedCatalog {
  if (error instanceof ApiError) return fallback(error.code === 'stale' ? 'stale' : error.code === 'mismatch' ? 'mismatch' : error.code === 'incomplete' ? 'incomplete' : 'unavailable', error.message);
  return fallback('unavailable', 'Metadata checks could not be completed. Listings and wallet actions still use blockchain RPC.');
}

/** No price/supply/balance value from the API leaves this function for transaction use. */
export async function loadIndexedCatalog({ client, chain, rpc, codeHash, selectedId, signal, now = Date.now }: {
  client: ApiClient; chain: ChainIdentity; rpc: RpcIdentityReader; codeHash: (code: string) => string;
  selectedId?: string | null; signal?: AbortSignal; now?: () => number;
}): Promise<IndexedCatalog> {
  const controller = new AbortController();
  let expired = false;
  const parentAbort = () => controller.abort(); signal?.addEventListener('abort', parentAbort, { once: true });
  if (signal?.aborted) controller.abort();
  // Bound the entire multi-request operation, including RPC provenance checks.
  const timer = setTimeout(() => { expired = true; controller.abort(); }, Math.min(15000, client.settings.timeoutMs * 3));
  let rejectAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new ApiError(expired ? 'timeout' : 'aborted', expired ? 'Metadata verification timed out. Blockchain RPC listings remain available.' : 'Metadata request cancelled.'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true }); if (controller.signal.aborted) rejectAbort();
  });
  const work = async (): Promise<IndexedCatalog> => {
    const [networks, synchronization] = await Promise.all([client.networks(controller.signal), client.synchronization(controller.signal)]);
    if (!networks.data.some(network => network.chainId === chain.chainId)) return failure('mismatch', 'The metadata API does not list the selected network. Using blockchain RPC listings.');
    const entries = synchronization.data.filter(entry => identityMatches(entry, chain) && entry.active);
    if (entries.length > 1) return failure('mismatch', 'Metadata deployment identity is ambiguous. Using blockchain RPC listings.');
    if (!entries.length) return synchronization.data.some(state => identityMatches(state, chain))
      ? fallback('mismatch', 'This indexed deployment was invalidated. Check indexer reset recovery; listings and wallet actions use blockchain RPC.')
      : fallback('incomplete', 'This deployment is not indexed yet. Listings and wallet actions use blockchain RPC.');
    const entry = entries[0];
    if (!recent(entry, client.settings.maxAgeMs, now())) return failure('stale', 'The indexer is behind, stopped or degraded. Published API metadata is withheld; listings use blockchain RPC.');
    const proofs = new Map<string, Promise<void>>();
    const verify = (state: SyncEntry) => {
      if (!identityMatches(state, chain) || state.deploymentId !== entry.deploymentId || state.instanceId !== entry.instanceId || !recent(state, client.settings.maxAgeMs, now()) || !state.provenance.receiptAndRuntimeVerifiedAtImport) return Promise.reject(new ApiError('mismatch', 'Metadata does not match the current deployment. Using blockchain RPC listings.'));
      for (const field of ['runtimeHash', 'abiHash', 'deploymentBlockHash', 'transactionHash', 'hardhatInstanceId', 'genesisHash'] as const) if (!same(state.provenance[field], entry.provenance[field])) return Promise.reject(new ApiError('mismatch', 'Metadata provenance changed during loading. Refresh metadata to retry.'));
      const key = `${state.instanceId}:${state.indexedBlockHash}`;
      if (!proofs.has(key)) proofs.set(key, (async () => {
        if (!identityMatches(state, chain) || state.deploymentId !== entry.deploymentId || state.instanceId !== entry.instanceId || !recent(state, client.settings.maxAgeMs, now()) || !state.provenance.receiptAndRuntimeVerifiedAtImport) return failure('mismatch', 'Metadata does not match the current deployment. Using blockchain RPC listings.');
        const p = state.provenance;
        if (chain.deploymentBlock > 0 && p.deploymentBlock !== String(chain.deploymentBlock)) return failure('mismatch', 'Metadata deployment block does not match the selected contract.');
        const [block, deployment, genesis, receipt, code, hardhat] = await Promise.all([
          rpc.getBlock(`0x${BigInt(state.indexedBlock!).toString(16)}`), rpc.getBlock(`0x${BigInt(p.deploymentBlock).toString(16)}`), rpc.getBlock(0),
          rpc.getTransactionReceipt(p.transactionHash), rpc.getCode(chain.address), rpc.send('hardhat_metadata', []),
        ]);
        const metadata = hardhat as { chainId?: number; instanceId?: string; forkedNetwork?: unknown } | null;
        if (!block || !same(block.hash, state.indexedBlockHash) || !deployment || !same(deployment.hash, p.deploymentBlockHash) || !genesis || !same(genesis.hash, p.genesisHash) || !receipt || receipt.status !== 1 || String(receipt.blockNumber) !== p.deploymentBlock || !same(receipt.blockHash, p.deploymentBlockHash) || !same(receipt.contractAddress, chain.address) || !same(codeHash(code), p.runtimeHash) || !metadata || String(metadata.chainId) !== chain.chainId || metadata.forkedNetwork || !same(metadata.instanceId, p.hardhatInstanceId)) return failure('mismatch', 'The indexed deployment or block no longer matches this local chain. API metadata is withheld.');
      })());
      return proofs.get(key)!;
    };
    await verify(entry);
    const records: ApiProperty[] = [];
    let total: number | null = null;
    for (let page = 1; page <= 10; page++) {
      const response = await client.properties({ chainId: chain.chainId, deploymentId: entry.deploymentId, page, limit: 100 }, controller.signal);
      if (response.meta.page !== page || response.meta.limit !== 100 || (total !== null && total !== response.meta.total) || response.meta.total > 1000) return failure('incomplete', 'The indexed catalog changed or exceeds the local browsing limit. Refresh metadata to retry.');
      total = response.meta.total;
      records.push(...response.data);
      if (records.length >= total) break;
      if (!response.data.length || page === 10) return failure('incomplete', 'The indexed catalog is incomplete. Using blockchain RPC listings.');
    }
    if (total !== records.length) return failure('incomplete', 'The indexed catalog changed while loading. Refresh metadata to retry.');
    // Detail is resolved only through the matching tuple, never a property name.
    if (selectedId) {
      const selected = records.filter(row => row.blockchain?.onChainId === selectedId);
      if (selected.length === 1) {
        const response = await client.property(selected[0].id, controller.signal);
        records[records.indexOf(selected[0])] = response.data;
      }
    }
    const ids = new Set<string>();
    for (const row of records) {
      const b = row.blockchain;
      if (row.source !== 'blockchain' || row.isFictional || !b || !identityMatches(b, chain) || b.deploymentId !== entry.deploymentId || b.deploymentInstanceId !== entry.instanceId || b.source !== 'reconciled_local_chain_snapshot' || !b.verifiedByApi || !b.synchronization || ids.has(b.onChainId)) return failure('mismatch', 'Indexed listings have a mismatched or duplicate identity. Using blockchain RPC listings.');
      ids.add(b.onChainId);
      if (b.observedBlock !== b.synchronization.indexedBlock || !same(b.observedBlockHash, b.synchronization.indexedBlockHash)) return failure('mismatch', 'Indexed listing and synchronization watermarks disagree. API metadata is withheld.');
      await verify(b.synchronization);
    }
    if (!recent(entry, client.settings.maxAgeMs, now())) return failure('stale', 'Indexer observations expired while loading. Refresh metadata to retry.');
    return { state: 'ready', message: 'Published metadata is matched to this deployment. Prices, supply and balances come from blockchain RPC.', records, sync: entry, checkedAt: now() };
  };
  try { return await Promise.race([work(), cancelled]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', parentAbort); if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort); controller.abort(); }
}

// External HTTPS references or strictly bounded local Studio media routes.
function assetUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); const local = url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname) && /^\/api\/v1\/media\/[a-f0-9-]{36}$/i.test(url.pathname) && !url.search && !url.hash; return (url.protocol === 'https:' || local) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function mergeIndexedCatalog<T extends RpcListing>(listings: T[], catalog: IndexedCatalog, maxAgeMs: number, now = Date.now()) {
  const eligible = catalog.state === 'ready' && !!catalog.sync && recent(catalog.sync, maxAgeMs, now) && now - catalog.checkedAt <= maxAgeMs;
  return listings.map(listing => {
    const row = !listing.sample && eligible ? catalog.records.find(record => {
      const b = record.blockchain; const sync = catalog.sync!;
      return record.source === 'blockchain' && !record.isFictional && !!b && b.onChainId === listing.id && b.chainId === sync.chainId && same(b.contractAddress, sync.contractAddress) && b.deploymentId === sync.deploymentId && b.deploymentInstanceId === sync.instanceId;
    }) : undefined;
    const metadata = row?.metadata;
    const available = (value: string) => ['configured_external_reference','local_published'].includes(value);
    const image = metadata?.assets.find(asset => asset.kind === 'image' && asset.purpose === 'hero' && available(asset.availability) && assetUrl(asset.url));
    const documents = metadata?.assets.filter(asset => asset.kind === 'document' && asset.purpose === 'supporting_document' && available(asset.availability) && assetUrl(asset.url)).map(asset => ({ title: asset.caption || 'Published supporting document', url: assetUrl(asset.url)! }));
    return {
      ...listing,
      ...(metadata ? {
        description: metadata.description || listing.description,
        characteristics: metadata.characteristics ?? {},
        image: image ? assetUrl(image.url)! : listing.image,
        imageAlt: image ? image.altText || listing.name : listing.imageAlt,
        imageCaption: image ? image.caption || 'Published image · operator supplied' : listing.imageCaption,
        documents: documents?.length ? documents : listing.documents,
      } : {}),
      metadataInfo: {
        source: metadata ? 'api' : listing.description || listing.image || listing.documents?.length ? 'local' : 'missing',
        status: eligible ? row ? metadata ? 'published' : 'not_published' : 'not_indexed' : catalog.state === 'ready' ? 'stale' : catalog.state,
        apiId: row?.id ?? null, indexedBlock: row?.blockchain?.observedBlock ?? null,
        version: metadata?.version ?? null, updatedAt: metadata?.updatedAt ?? null,
        title: metadata?.title ?? null, unavailableAssets: metadata?.assets.filter(asset => !assetUrl(asset.url) || !available(asset.availability)).length ?? 0,
        usedLocalFallback: !!metadata && ((!metadata.description && !!listing.description) || (!image && !!listing.image) || (!documents?.length && !!listing.documents?.length)),
      },
    };
  });
}
