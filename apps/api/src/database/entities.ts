import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

abstract class Row {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('chains')
export class Chain extends Row {
  @Index({ unique: true }) @Column({ name: 'chain_id', type: 'bigint' }) chainId!: string;
  @Column({ type: 'varchar', length: 100 }) name!: string;
  @Column({ name: 'explorer_url', type: 'text', nullable: true }) explorerUrl!: string | null;
  @Column({ type: 'boolean', default: true }) enabled!: boolean;
}

@Entity('contract_deployments')
@Index(['chainId', 'address'], { unique: true })
export class ContractDeployment extends Row {
  @Column({ name: 'chain_id', type: 'uuid' }) chainId!: string;
  @ManyToOne(() => Chain, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'chain_id' }) chain!: Chain;
  @Column({ type: 'bytea' }) address!: Buffer;
  @Column({ name: 'deployment_block', type: 'bigint' }) deploymentBlock!: string;
  @Column({ name: 'deployment_block_hash', type: 'bytea' }) deploymentBlockHash!: Buffer;
  @Column({ name: 'transaction_hash', type: 'bytea' }) transactionHash!: Buffer;
  @Column({ name: 'owner_address', type: 'bytea' }) ownerAddress!: Buffer;
  @Column({ name: 'artifact_hash', type: 'bytea' }) artifactHash!: Buffer;
  @Column({ name: 'abi_version', type: 'varchar', length: 100 }) abiVersion!: string;
  @Column({ name: 'release_reference', type: 'varchar', length: 160, nullable: true }) releaseReference!: string | null;
}

export type PropertySource = 'blockchain' | 'fictional';
@Entity('properties')
export class Property extends Row {
  @Column({ name: 'deployment_instance_id', type: 'uuid', nullable: true }) deploymentInstanceId!: string | null;
  @Column({ name: 'creation_block_hash', type: 'bytea', nullable: true }) creationBlockHash!: Buffer | null;
  @Column({ name: 'canonical_snapshot', type: 'boolean', default: false }) canonicalSnapshot!: boolean;
  @Column({ type: 'varchar', length: 20 }) source!: PropertySource;
  @Column({ name: 'fixture_label', type: 'text', nullable: true }) fixtureLabel!: string | null;
  @Column({ name: 'deployment_id', type: 'uuid', nullable: true }) deploymentId!: string | null;
  @ManyToOne(() => ContractDeployment, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'deployment_id' }) deployment!: ContractDeployment | null;
  @Column({ name: 'on_chain_id', type: 'numeric', precision: 78, scale: 0, nullable: true }) onChainId!: string | null;
  @Column({ name: 'chain_name', type: 'text', nullable: true }) chainName!: string | null;
  @Column({ name: 'chain_location', type: 'text', nullable: true }) chainLocation!: string | null;
  @Column({ name: 'total_tokens', type: 'numeric', precision: 78, scale: 0, nullable: true }) totalTokens!: string | null;
  @Column({ name: 'available_tokens', type: 'numeric', precision: 78, scale: 0, nullable: true }) availableTokens!: string | null;
  @Column({ name: 'token_price_wei', type: 'numeric', precision: 78, scale: 0, nullable: true }) tokenPriceWei!: string | null;
  @Column({ type: 'boolean', nullable: true }) active!: boolean | null;
  @Column({ name: 'observed_block', type: 'bigint', nullable: true }) observedBlock!: string | null;
  @Column({ name: 'observed_block_hash', type: 'bytea', nullable: true }) observedBlockHash!: Buffer | null;
  @OneToMany(() => PropertyMetadataVersion, metadata => metadata.property) metadataVersions!: PropertyMetadataVersion[];
}

export type PublicationState = 'draft' | 'published' | 'archived';
@Entity('property_metadata_versions')
@Index(['propertyId', 'version'], { unique: true })
export class PropertyMetadataVersion extends Row {
  @Column({ name: 'property_id', type: 'uuid' }) propertyId!: string;
  @ManyToOne(() => Property, property => property.metadataVersions, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'property_id' }) property!: Property;
  @Column({ type: 'integer' }) version!: number;
  @Column({ type: 'varchar', length: 20, default: 'draft' }) state!: PublicationState;
  @Column({ type: 'text', nullable: true }) title!: string | null;
  @Column({ type: 'text', nullable: true }) location!: string | null;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'author_reference', type: 'varchar', length: 160, nullable: true }) authorReference!: string | null;
  @Column({ type: 'jsonb', default: {} }) characteristics!: Record<string, unknown>;
  @OneToMany(() => PropertyAsset, link => link.metadataVersion) assets!: PropertyAsset[];
}

@Entity('public_assets')
export class PublicAsset extends Row {
  @Index({ unique: true }) @Column({ name: 'object_key', type: 'text' }) objectKey!: string;
  @Column({ name: 'mime_type', type: 'varchar', length: 100 }) mimeType!: string;
  @Column({ name: 'byte_size', type: 'bigint' }) byteSize!: string;
  @Column({ name: 'sha256', type: 'bytea' }) sha256!: Buffer;
  @Column({ type: 'varchar', length: 20 }) kind!: 'image' | 'document';
  @Column({ type: 'varchar', length: 20, default: 'draft' }) state!: PublicationState;
  @Column({ name: 'created_by_reference', type: 'varchar', length: 160, nullable: true }) createdByReference!: string | null;
}

@Entity('property_assets')
@Index(['metadataVersionId', 'assetId'], { unique: true })
export class PropertyAsset extends Row {
  @Column({ name: 'metadata_version_id', type: 'uuid' }) metadataVersionId!: string;
  @ManyToOne(() => PropertyMetadataVersion, metadata => metadata.assets, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'metadata_version_id' }) metadataVersion!: PropertyMetadataVersion;
  @Column({ name: 'asset_id', type: 'uuid' }) assetId!: string;
  @ManyToOne(() => PublicAsset, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'asset_id' }) asset!: PublicAsset;
  @Column({ type: 'varchar', length: 40 }) purpose!: string;
  @Column({ name: 'alt_text', type: 'text', nullable: true }) altText!: string | null;
  @Column({ type: 'text', nullable: true }) caption!: string | null;
  @Column({ name: 'display_order', type: 'integer', default: 0 }) displayOrder!: number;
}

export const entities = [Chain, ContractDeployment, Property, PropertyMetadataVersion, PublicAsset, PropertyAsset];
