import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
abstract class StudioIdentity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "organization_id", type: "uuid" }) organizationId!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
@Entity("studio_records")
export class StudioRecord extends StudioIdentity {
  @Column({ name: "property_id", type: "uuid", nullable: true }) propertyId!:
    | string
    | null;
  @Column({ name: "created_by", type: "uuid" }) createdBy!: string;
  @Column({ type: "boolean" }) archived!: boolean;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
@Entity("studio_versions")
export class StudioVersion extends StudioIdentity {
  @Column({ name: "record_id", type: "uuid" }) recordId!: string;
  @Column({ type: "integer" }) version!: number;
  @Column({ type: "integer" }) revision!: number;
  @Column({ type: "varchar" }) state!: "draft" | "published" | "archived";
  @Column({ type: "varchar" }) title!: string;
  @Column({ type: "varchar" }) location!: string;
  @Column({ type: "text" }) description!: string;
  @Column({ type: "jsonb" }) characteristics!: Record<string, unknown>;
  @Column({ name: "created_by", type: "uuid" }) createdBy!: string;
  @Column({ name: "published_by", type: "uuid", nullable: true }) publishedBy!:
    | string
    | null;
  @Column({ name: "published_at", type: "timestamptz", nullable: true })
  publishedAt!: Date | null;
  @Column({ name: "projection_id", type: "uuid", nullable: true })
  projectionId!: string | null;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
@Entity("studio_assets")
export class StudioAsset extends StudioIdentity {
  @Column({ name: "record_id", type: "uuid" }) recordId!: string;
  @Column({ name: "storage_key", type: "uuid" }) storageKey!: string;
  @Column({ name: "original_name", type: "varchar" }) originalName!: string;
  @Column({ name: "mime_type", type: "varchar" }) mimeType!: string;
  @Column({ type: "varchar" }) kind!: "image" | "document";
  @Column({ name: "byte_size", type: "integer" }) byteSize!: number;
  @Column({ type: "bytea" }) sha256!: Buffer;
  @Column({ name: "created_by", type: "uuid" }) createdBy!: string;
}
@Entity("studio_version_assets")
export class StudioVersionAsset {
  @PrimaryColumn({ name: "version_id", type: "uuid" }) versionId!: string;
  @PrimaryColumn({ name: "asset_id", type: "uuid" }) assetId!: string;
  @Column({ name: "record_id", type: "uuid" }) recordId!: string;
  @Column({ name: "organization_id", type: "uuid" }) organizationId!: string;
  @Column({ type: "varchar" }) purpose!: string;
  @Column({ name: "alt_text", type: "varchar" }) altText!: string;
  @Column({ type: "varchar" }) caption!: string;
  @Column({ name: "display_order", type: "integer" }) displayOrder!: number;
}
@Entity("studio_audit_logs")
export class StudioAuditLog extends StudioIdentity {
  @Column({ name: "record_id", type: "uuid" }) recordId!: string;
  @Column({ name: "actor_user_id", type: "uuid" }) actorUserId!: string;
  @Column({ type: "varchar" }) action!: string;
  @Column({ name: "version_id", type: "uuid", nullable: true }) versionId!:
    | string
    | null;
  @Column({ name: "request_id", type: "uuid", nullable: true }) requestId!:
    | string
    | null;
}
export const studioEntities = [
  StudioRecord,
  StudioVersion,
  StudioAsset,
  StudioVersionAsset,
  StudioAuditLog,
];
