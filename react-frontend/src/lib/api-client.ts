import type { ApiSettings, NetworksResponse, PropertiesResponse, PropertyQuery, PropertyResponse, Synchronization } from './api-types.ts';

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, message: string, status?: number) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; }
}
export function apiSettings(env: Record<string, unknown> = {}, network = 'localhost'): ApiSettings {
  const fail = () => { throw new ApiError('configuration', 'Metadata API configuration is invalid. Check the public API URL and timeout settings.'); };
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = env[key] === undefined || env[key] === '' ? fallback : env[key];
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) return fail();
    return Number(value);
  };
  const raw = String(env.VITE_API_BASE_URL ?? '').trim();
  let baseUrl: string | null = null;
  if (raw) {
    try {
      const url = new URL(raw);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(network === 'localhost' && local && url.protocol === 'http:'))) return fail();
      baseUrl = url.href.replace(/\/$/, '');
    } catch { return fail(); }
  }
  return { baseUrl, timeoutMs: number('VITE_API_TIMEOUT_MS', 3000, 100, 10000), maxAgeMs: number('VITE_API_MAX_AGE_MS', 30000, 1000, 300000), pollMs: number('VITE_API_POLL_MS', 15000, 5000, 60000) };
}
const invalid = (): never => { throw new ApiError('invalid_response', 'Metadata API returned an incompatible response. Using blockchain RPC listings.'); };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string';
const nullableText = (value: unknown) => value === null || text(value);
const decimal = (value: unknown) => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && value.length <= 78;
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value);
const address = (value: unknown) => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullable = (check: (value: unknown) => boolean, value: unknown) => value === null || check(value);
function syncEntry(value: unknown): boolean {
  if (!object(value) || !uuid(value.instanceId) || !uuid(value.deploymentId) || !decimal(value.chainId) || !address(value.contractAddress) || typeof value.active !== 'boolean') return false;
  if (!['initializing', 'syncing', 'synced', 'error', 'invalidated'].includes(value.status) || !['never_synced', 'catching_up', 'recently_checked', 'stale', 'degraded', 'invalidated'].includes(value.freshness)) return false;
  if (!nullable(decimal, value.indexedBlock) || !nullable(hash, value.indexedBlockHash) || !nullable(decimal, value.observedHead) || !nullable(decimal, value.observedLag) || !nullable(date, value.lastSuccessAt) || !nullable(date, value.lastAttemptAt) || !decimal(value.revision) || !Number.isInteger(value.reorgCount) || value.reorgCount < 0 || !nullableText(value.errorCode) || value.finalityPolicy !== 'local-latest-unfinalized') return false;
  const p = value.provenance;
  return object(p) && typeof p.receiptAndRuntimeVerifiedAtImport === 'boolean' && hash(p.abiHash) && hash(p.runtimeHash) && decimal(p.deploymentBlock) && hash(p.deploymentBlockHash) && hash(p.transactionHash) && nullableText(p.releaseReference) && (p.hardhatInstanceId === undefined || hash(p.hardhatInstanceId)) && (p.genesisHash === undefined || hash(p.genesisHash));
}
function synchronization(value: unknown): value is Synchronization {
  return object(value) && value.mode === 'local_read_only' && value.authority === 'smart_contract' && Array.isArray(value.data) && value.data.length <= 10000 && value.data.every(syncEntry);
}
function metadata(value: unknown): boolean {
  if (value === null) return true;
  if (!object(value) || value.source !== 'operator_metadata' || value.publicationState !== 'published' || !Number.isInteger(value.version) || value.version < 1 || !date(value.updatedAt) || !['title', 'location', 'description'].every(key => nullableText(value[key])) || !Array.isArray(value.assets) || value.assets.length > 500) return false;
  return value.assets.every((asset: unknown) => object(asset) && uuid(asset.id) && ['image', 'document'].includes(asset.kind) && text(asset.mimeType) && decimal(asset.byteSize) && hash(asset.sha256) && text(asset.purpose) && nullableText(asset.altText) && nullableText(asset.caption) && nullableText(asset.url) && ['not_served_by_api', 'configured_external_reference', 'local_published'].includes(asset.availability));
}
function property(value: unknown): boolean {
  if (!object(value) || !uuid(value.id) || !['blockchain', 'fictional'].includes(value.source) || typeof value.isFictional !== 'boolean' || !nullableText(value.fixtureLabel) || !metadata(value.metadata)) return false;
  if (value.source === 'fictional') return value.isFictional && value.blockchain === null;
  const b = value.blockchain;
  return !value.isFictional && object(b) && ['reconciled_local_chain_snapshot', 'unverified_database_snapshot'].includes(b.source) && typeof b.verifiedByApi === 'boolean' && nullable(uuid, b.deploymentInstanceId) && nullable(syncEntry, b.synchronization) && uuid(b.deploymentId) && decimal(b.chainId) && address(b.contractAddress) && ['onChainId', 'totalTokens', 'availableTokens', 'tokenPriceWei', 'observedBlock'].every(key => decimal(b[key])) && hash(b.observedBlockHash) && text(b.name) && text(b.location) && typeof b.active === 'boolean';
}
export class ApiClient {
  readonly settings: ApiSettings;
  private readonly fetcher: typeof fetch;
  constructor(settings: ApiSettings, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) { this.settings = settings; this.fetcher = fetcher; }
  private async get<T>(path: string, validate: (value: unknown) => boolean, signal?: AbortSignal): Promise<T> {
    if (!this.settings.baseUrl) throw new ApiError('disabled', 'Metadata API is not enabled.');
    const controller = new AbortController(); let timedOut = false;
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.settings.timeoutMs);
    let rejectAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new ApiError(timedOut ? 'timeout' : 'aborted', timedOut ? 'Metadata API timed out. Blockchain RPC listings remain available.' : 'Metadata request cancelled.'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
      if (controller.signal.aborted) rejectAbort();
    });
    try {
      return await Promise.race([cancelled, (async () => {
        if (controller.signal.aborted) throw new ApiError('aborted', 'Metadata request cancelled.');
        const response = await this.fetcher(`${this.settings.baseUrl}${path}`, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new ApiError(response.status === 404 ? 'not_found' : 'http', response.status === 404 ? 'Published property metadata was not found.' : 'Metadata API is unavailable. Blockchain RPC listings remain available.', response.status);
        if (!response.headers.get('content-type')?.includes('application/json')) return invalid();
        let value: unknown; try { value = await response.json(); } catch { return invalid(); }
        if (!validate(value)) return invalid();
        // Local Studio assets are supplied as exact relative media routes only.
        // Resolve against the configured API, never the frontend or an arbitrary URL.
        const data = (value as any)?.data;
        for (const row of Array.isArray(data) ? data : data ? [data] : []) for (const asset of row.metadata?.assets ?? []) {
          if (asset.availability === 'local_published') {
            if (asset.url !== `/api/v1/media/${asset.id}`) return invalid();
            asset.url = new URL(asset.url, this.settings.baseUrl!).href;
          }
        }
        return value as T;
      })()]);
    } catch (error) {
      if (timedOut) throw new ApiError('timeout', 'Metadata API timed out. Blockchain RPC listings remain available.');
      if (signal?.aborted) throw new ApiError('aborted', 'Metadata request cancelled.');
      if (error instanceof ApiError) throw error;
      throw new ApiError('network', 'Metadata API could not be reached. Check that it is running and allows this frontend origin.');
    } finally {
      clearTimeout(timeout); signal?.removeEventListener('abort', abort);
      if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
    }
  }
  networks(signal?: AbortSignal): Promise<NetworksResponse> {
    return this.get('/api/v1/networks', value => object(value) && Array.isArray(value.data) && value.data.every((row: any) => object(row) && uuid(row.id) && decimal(row.chainId) && text(row.name) && nullableText(row.explorerUrl)) && object(value.meta) && value.meta.source === 'database_configuration' && text(value.meta.synchronizationStatusUrl), signal);
  }
  synchronization(signal?: AbortSignal): Promise<Synchronization> { return this.get('/api/v1/synchronization', synchronization, signal); }
  properties(query: PropertyQuery = {}, signal?: AbortSignal): Promise<PropertiesResponse> {
    const params = new URLSearchParams({ source: 'blockchain' });
    for (const [key, value] of Object.entries(query)) if (value !== undefined) {
      if (!['page', 'limit', 'chainId', 'deploymentId', 'q', 'location'].includes(key)) throw new ApiError('query', 'Unsupported property query.');
      params.set(key, String(value));
    }
    return this.get(`/api/v1/properties?${params}`, value => object(value) && Array.isArray(value.data) && value.data.length <= 100 && value.data.every(property) && object(value.meta) && value.meta.source === 'blockchain' && synchronization(value.meta.synchronization) && Number.isInteger(value.meta.page) && value.meta.page >= 1 && Number.isInteger(value.meta.limit) && value.meta.limit >= 1 && value.meta.limit <= 100 && Number.isSafeInteger(value.meta.total) && value.meta.total >= 0, signal);
  }
  property(id: string, signal?: AbortSignal): Promise<PropertyResponse> {
    if (!uuid(id)) throw new ApiError('query', 'A valid internal property UUID is required.');
    return this.get(`/api/v1/properties/${encodeURIComponent(id)}?source=blockchain`, value => object(value) && property(value.data) && value.data.id === id && object(value.meta) && value.meta.source === 'blockchain' && synchronization(value.meta.synchronization), signal);
  }
}
