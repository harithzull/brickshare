export interface ApiAsset {
  id: string; kind: 'image' | 'document'; mimeType: string; byteSize: string;
  sha256: string; purpose: string; altText: string | null; caption: string | null;
  url: string | null; availability: 'not_served_by_api' | 'configured_external_reference';
}
export interface PublishedMetadata {
  source: 'operator_metadata'; version: number; title: string | null;
  location: string | null; description: string | null; publicationState: 'published';
  updatedAt: string; assets: ApiAsset[];
}
export interface SyncEntry {
  deploymentId: string; instanceId: string; chainId: string; contractAddress: string;
  active: boolean; status: 'initializing' | 'syncing' | 'synced' | 'error' | 'invalidated';
  freshness: 'never_synced' | 'catching_up' | 'recently_checked' | 'stale' | 'degraded' | 'invalidated';
  indexedBlock: string | null; indexedBlockHash: string | null; observedHead: string | null; observedLag: string | null;
  lastAttemptAt: string | null; lastSuccessAt: string | null; finalityPolicy: 'local-latest-unfinalized';
  errorCode: string | null; reorgCount: number; revision: string;
  provenance: {
    receiptAndRuntimeVerifiedAtImport: boolean; abiHash: string; runtimeHash: string;
    deploymentBlock: string; deploymentBlockHash: string; transactionHash: string;
    releaseReference: string | null;
    // Additive Phase 2B.2 fields; older APIs fail safely to RPC-only browsing.
    hardhatInstanceId?: string; genesisHash?: string;
  };
}
export interface Synchronization {
  mode: 'local_read_only'; authority: 'smart_contract'; data: SyncEntry[];
}
export interface BlockchainSnapshot {
  source: 'reconciled_local_chain_snapshot' | 'unverified_database_snapshot'; verifiedByApi: boolean;
  deploymentInstanceId: string | null; synchronization: SyncEntry | null;
  deploymentId: string; chainId: string; contractAddress: string; onChainId: string;
  name: string; location: string; totalTokens: string; availableTokens: string;
  tokenPriceWei: string; active: boolean; observedBlock: string; observedBlockHash: string;
}
export interface ApiProperty {
  id: string; source: 'blockchain' | 'fictional'; isFictional: boolean; fixtureLabel: string | null;
  blockchain: BlockchainSnapshot | null; metadata: PublishedMetadata | null;
}
export interface PropertiesResponse {
  data: ApiProperty[];
  meta: { source: 'blockchain' | 'fictional'; synchronization: Synchronization; page: number; limit: number; total: number };
}
export interface PropertyResponse { data: ApiProperty; meta: { source: 'blockchain' | 'fictional'; synchronization: Synchronization }; }
export interface NetworksResponse {
  data: Array<{ id: string; chainId: string; name: string; explorerUrl: string | null }>;
  meta: { source: 'database_configuration'; synchronizationStatusUrl: string };
}
export interface PropertyQuery { page?: number; limit?: number; chainId?: string; deploymentId?: string; q?: string; location?: string; }
export interface ApiSettings { baseUrl: string | null; timeoutMs: number; maxAgeMs: number; pollMs: number; }
