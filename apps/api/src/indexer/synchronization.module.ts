import { Controller, Get, Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.module';
import { Environment } from '../config/environment';
import { EntityManager } from 'typeorm';

export function freshness(lastSuccess: Date | null, status: string, staleMs: number, now = Date.now()) {
  if (status === 'invalidated') return 'invalidated';
  if (!lastSuccess) return 'never_synced';
  if (status === 'error') return 'degraded';
  return now - lastSuccess.getTime() > staleMs ? 'stale' : status === 'syncing' ? 'catching_up' : 'recently_checked';
}
@Injectable()
export class SynchronizationService {
  constructor(private readonly database: DatabaseService, private readonly config: ConfigService) {}
  async status(manager?: EntityManager) {
    await this.database.requireReady();
    const rows = await (manager ?? this.database.source).query(`SELECT i.*,c.chain_id,d.address,s.last_scanned_block,s.last_scanned_hash,s.observed_head,s.status,s.error_code,s.finality_policy,s.last_attempt_at,s.last_success_at,s.reorg_count,s.revision
      FROM deployment_instances i JOIN contract_deployments d ON d.id=i.deployment_id JOIN chains c ON c.id=d.chain_id JOIN indexer_cursors s ON s.instance_id=i.id ORDER BY i.created_at,i.id`);
    const staleMs = this.config.getOrThrow<Environment>('validated').INDEXER_STALE_AFTER_MS;
    return { mode: 'local_read_only', authority: 'smart_contract', data: rows.map((row: any) => ({
      deploymentId: row.deployment_id, instanceId: row.id, chainId: row.chain_id, contractAddress: `0x${row.address.toString('hex')}`,
      active: row.active, status: row.status, freshness: freshness(row.last_success_at, row.status, staleMs),
      indexedBlock: row.last_scanned_block, indexedBlockHash: row.last_scanned_hash ? `0x${row.last_scanned_hash.toString('hex')}` : null,
      observedHead: row.observed_head, observedLag: row.observed_head !== null && row.last_scanned_block !== null ? (BigInt(row.observed_head) > BigInt(row.last_scanned_block) ? BigInt(row.observed_head) - BigInt(row.last_scanned_block) : 0n).toString() : null,
      lastAttemptAt: row.last_attempt_at?.toISOString() ?? null, lastSuccessAt: row.last_success_at?.toISOString() ?? null,
      finalityPolicy: row.finality_policy, errorCode: row.error_code, reorgCount: row.reorg_count, revision: row.revision,
      provenance: { receiptAndRuntimeVerifiedAtImport: true, abiHash: `0x${row.abi_hash.toString('hex')}`, runtimeHash: `0x${row.runtime_hash.toString('hex')}`, deploymentBlock: row.deployment_block, deploymentBlockHash: `0x${row.deployment_block_hash.toString('hex')}`, transactionHash: `0x${row.transaction_hash.toString('hex')}`, releaseReference: row.release_reference },
    })) };
  }
}
@Controller('api/v1/synchronization')
export class SynchronizationController {
  constructor(private readonly synchronization: SynchronizationService) {}
  @Get() status() { return this.synchronization.status(); }
}
@Global()
@Module({ providers: [SynchronizationService], exports: [SynchronizationService], controllers: [SynchronizationController] })
export class SynchronizationModule {}
