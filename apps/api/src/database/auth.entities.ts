import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
abstract class IdentityRow {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
abstract class MutableRow extends IdentityRow { @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date; }
@Entity('users') export class User extends MutableRow {
  @Column({ name: 'platform_role', type: 'varchar', length: 24 }) platformRole!: 'investor' | 'platform_admin';
  @Column({ type: 'varchar', length: 16 }) status!: 'active' | 'suspended';
  @Column({ name: 'display_name', type: 'varchar', length: 100, nullable: true }) displayName!: string | null;
}
@Entity('wallet_identities') export class WalletIdentity extends MutableRow {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'bytea' }) address!: Buffer;
  @Column({ type: 'varchar', length: 8 }) kind!: 'EOA';
  @Column({ name: 'verified_at', type: 'timestamptz' }) verifiedAt!: Date;
}
@Entity('auth_challenges') export class LoginChallenge extends IdentityRow {
  @Column({ type: 'bytea' }) address!: Buffer;
  @Column({ name: 'chain_id', type: 'bigint' }) chainId!: string;
  @Column({ name: 'nonce_hash', type: 'bytea' }) nonceHash!: Buffer;
  @Column({ name: 'binding_hash', type: 'bytea' }) bindingHash!: Buffer;
  @Column({ name: 'csrf_hash', type: 'bytea' }) csrfHash!: Buffer;
  @Column({ name: 'message_hash', type: 'bytea' }) messageHash!: Buffer;
  @Column({ type: 'text' }) origin!: string;
  @Column({ type: 'text' }) domain!: string;
  @Column({ type: 'text' }) uri!: string;
  @Column({ name: 'issued_at', type: 'timestamptz' }) issuedAt!: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true }) consumedAt!: Date | null;
}
@Entity('sessions') export class Session extends IdentityRow {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'wallet_id', type: 'uuid' }) walletId!: string;
  @Column({ name: 'token_hash', type: 'bytea' }) tokenHash!: Buffer;
  @Column({ name: 'csrf_hash', type: 'bytea' }) csrfHash!: Buffer;
  @Column({ name: 'chain_id', type: 'bigint' }) chainId!: string;
  @Column({ type: 'text' }) origin!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
}
@Entity('organizations') export class Organization extends MutableRow {
  @Column({ type: 'varchar', length: 100 }) name!: string;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
}
@Entity('organization_memberships') export class OrganizationMembership extends MutableRow {
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar', length: 12 }) role!: 'owner' | 'editor' | 'viewer';
}
@Entity('organization_invitations') export class OrganizationInvitation extends MutableRow {
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ type: 'bytea' }) address!: Buffer;
  @Column({ type: 'varchar', length: 12 }) role!: 'editor' | 'viewer';
  @Column({ name: 'invited_by_user_id', type: 'uuid' }) invitedByUserId!: string;
  @Column({ name: 'accepted_by_user_id', type: 'uuid', nullable: true }) acceptedByUserId!: string | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
}
@Entity('security_audit_logs') export class SecurityAuditLog extends IdentityRow {
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true }) organizationId!: string | null;
  @Column({ name: 'subject_user_id', type: 'uuid', nullable: true }) subjectUserId!: string | null;
  @Column({ type: 'varchar', length: 64 }) action!: string;
  @Column({ name: 'request_id', type: 'uuid', nullable: true }) requestId!: string | null;
  @Column({ type: 'jsonb' }) details!: Record<string, string>;
}
@Entity('auth_rate_limits') export class AuthRateLimit {
  @PrimaryColumn({ name: 'bucket_hash', type: 'bytea' }) bucketHash!: Buffer;
  @Column({ type: 'integer' }) count!: number;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
}
export const authEntities = [User, WalletIdentity, LoginChallenge, Session, Organization, OrganizationMembership, OrganizationInvitation, SecurityAuditLog, AuthRateLimit];
