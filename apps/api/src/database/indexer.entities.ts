import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

abstract class IndexedRow {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
@Entity('deployment_instances')
export class DeploymentInstance extends IndexedRow {
  @Column({ name: 'deployment_id', type: 'uuid' }) deploymentId!: string;
  @Column({ type: 'bytea' }) fingerprint!: Buffer;
  @Column({ name: 'hardhat_instance_id', type: 'bytea' }) hardhatInstanceId!: Buffer;
  @Column({ name: 'genesis_hash', type: 'bytea' }) genesisHash!: Buffer;
  @Column({ name: 'deployment_block', type: 'bigint' }) deploymentBlock!: string;
  @Column({ name: 'deployment_block_hash', type: 'bytea' }) deploymentBlockHash!: Buffer;
  @Column({ name: 'transaction_hash', type: 'bytea' }) transactionHash!: Buffer;
  @Column({ name: 'runtime_hash', type: 'bytea' }) runtimeHash!: Buffer;
  @Column({ name: 'abi_hash', type: 'bytea' }) abiHash!: Buffer;
  @Column({ name: 'owner_address', type: 'bytea' }) ownerAddress!: Buffer;
  @Column({ name: 'release_reference', type: 'varchar', length: 160, nullable: true }) releaseReference!: string | null;
  @Column({ type: 'boolean' }) active!: boolean;
}
@Entity('chain_blocks')
export class ChainBlock extends IndexedRow {
  @Column({ name: 'instance_id', type: 'uuid' }) instanceId!: string;
  @Column({ name: 'block_number', type: 'bigint' }) blockNumber!: string;
  @Column({ name: 'block_hash', type: 'bytea' }) blockHash!: Buffer;
  @Column({ name: 'parent_hash', type: 'bytea' }) parentHash!: Buffer;
  @Column({ name: 'block_timestamp', type: 'timestamptz' }) blockTimestamp!: Date;
  @Column({ type: 'boolean' }) canonical!: boolean;
}
@Entity('chain_events')
export class ChainEvent extends IndexedRow {
  @Column({ name: 'instance_id', type: 'uuid' }) instanceId!: string;
  @Column({ name: 'block_number', type: 'bigint' }) blockNumber!: string;
  @Column({ name: 'block_hash', type: 'bytea' }) blockHash!: Buffer;
  @Column({ name: 'transaction_hash', type: 'bytea' }) transactionHash!: Buffer;
  @Column({ name: 'transaction_index', type: 'integer' }) transactionIndex!: number;
  @Column({ name: 'log_index', type: 'integer' }) logIndex!: number;
  @Column({ name: 'event_name', type: 'varchar', length: 40 }) eventName!: string;
  @Column({ type: 'jsonb' }) topics!: string[];
  @Column({ type: 'text' }) data!: string;
  @Column({ type: 'jsonb' }) payload!: Record<string, string | boolean>;
  @Column({ type: 'boolean' }) canonical!: boolean;
}
@Entity('indexer_cursors')
export class IndexerCursor {
  @PrimaryColumn({ name: 'instance_id', type: 'uuid' }) instanceId!: string;
  @Column({ name: 'last_scanned_block', type: 'bigint', nullable: true }) lastScannedBlock!: string | null;
  @Column({ name: 'last_scanned_hash', type: 'bytea', nullable: true }) lastScannedHash!: Buffer | null;
  @Column({ name: 'observed_head', type: 'bigint', nullable: true }) observedHead!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: string;
  @Column({ name: 'finality_policy', type: 'text' }) finalityPolicy!: string;
  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true }) errorCode!: string | null;
  @Column({ name: 'reorg_count', type: 'integer' }) reorgCount!: number;
  @Column({ type: 'bigint' }) revision!: string;
  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true }) lastAttemptAt!: Date | null;
  @Column({ name: 'last_success_at', type: 'timestamptz', nullable: true }) lastSuccessAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
export const indexerEntities = [DeploymentInstance, ChainBlock, ChainEvent, IndexerCursor];
