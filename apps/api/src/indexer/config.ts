import { resolve } from 'node:path';
import { apiRoot } from '../config/environment';

export interface IndexerSettings {
  rpcUrl: string; manifestPath: string; artifactPath: string; abiPath: string;
  pollMs: number; timeoutMs: number; batchSize: number; reorgDepth: number;
  maxProperties: number; maxEvents: number; allowRebind: boolean; releaseReference: string | null;
}
export function indexerSettings(input: Record<string, unknown>): IndexerSettings {
  const fail = () => { throw new Error('Invalid local indexer configuration; check INDEXER_* settings. Values redacted.'); };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = input[key] ?? fallback;
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) return fail();
    return Number(value);
  };
  const rpcUrl = String(input.INDEXER_RPC_URL ?? 'http://127.0.0.1:8545');
  try {
    const url = new URL(rpcUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') fail();
  } catch { fail(); }
  if (input.NODE_ENV === 'production' || (input.INDEXER_CHAIN_ID !== undefined && String(input.INDEXER_CHAIN_ID) !== '31337')) fail();
  const rebind = input.INDEXER_ALLOW_LOCAL_REBIND ?? 'false';
  if (![true, false, 'true', 'false'].includes(rebind as boolean | string)) fail();
  const file = (key: string, fallback: string) => resolve(apiRoot, '../..', String(input[key] ?? fallback));
  const reference = input.INDEXER_RELEASE_REFERENCE;
  if (reference !== undefined && (typeof reference !== 'string' || reference.length > 160 || /[\r\n]/.test(reference))) fail();
  return {
    rpcUrl, manifestPath: file('INDEXER_DEPLOYMENT_FILE', 'react-frontend/src/generated/deployment.json'),
    artifactPath: file('INDEXER_ARTIFACT_FILE', 'artifacts/contracts/RealEstateTokenization.sol/RealEstateTokenization.json'),
    abiPath: resolve(apiRoot, '../../react-frontend/src/generated/RealEstateTokenization.abi.json'),
    pollMs: integer('INDEXER_POLL_MS', 2000, 250, 30000), timeoutMs: integer('INDEXER_RPC_TIMEOUT_MS', 5000, 100, 30000),
    batchSize: integer('INDEXER_BATCH_SIZE', 25, 1, 200), reorgDepth: integer('INDEXER_REORG_DEPTH', 64, 1, 1000),
    maxProperties: integer('INDEXER_MAX_PROPERTIES', 1000, 1, 10000), maxEvents: integer('INDEXER_MAX_EVENTS', 100000, 1, 1000000),
    allowRebind: rebind === true || rebind === 'true', releaseReference: reference ? String(reference) : null,
  };
}
