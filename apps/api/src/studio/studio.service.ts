import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { EntityManager } from "typeorm";
import { DatabaseService } from "../database/database.module";
import { AuthRequest } from "../auth/auth.service";
import { StudioStorage, checksum, validateFile } from "./storage";
import { StudioProvenance } from "./provenance";
import { DraftDto, EditDraftDto, PublishDto, UploadDto } from "./studio.dto";

@Injectable()
export class StudioService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StudioStorage,
    private readonly provenance: StudioProvenance,
  ) {}
  private async scope(
    manager: EntityManager,
    orgId: string,
    request: AuthRequest,
    permission: "read" | "edit" | "publish",
    lock = false,
  ) {
    const user = request.sessionContext!.userId;
    if (lock)
      await manager.query(
        "SELECT id FROM organizations WHERE id=$1 AND EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=$1 AND user_id=$2) FOR UPDATE",
        [orgId, user],
      );
    const [member] = await manager.query(
      "SELECT role FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",
      [orgId, user],
    );
    if (!member) throw new NotFoundException("Organization not found");
    if (
      (permission === "edit" && member.role === "viewer") ||
      (permission === "publish" && member.role !== "owner")
    )
      throw new ForbiddenException(
        "Organization role does not permit this Studio action",
      );
    return {
      role: member.role,
      canEdit: member.role !== "viewer",
      canPublish: member.role === "owner",
    };
  }
  private async record(
    manager: EntityManager,
    orgId: string,
    id: string,
    lock = false,
  ) {
    const [record] = await manager.query(
      `SELECT * FROM studio_records WHERE organization_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
      [orgId, id],
    );
    if (!record) throw new NotFoundException("Studio record not found");
    return record;
  }
  private async log(
    manager: EntityManager,
    request: AuthRequest,
    org: string,
    record: string,
    action: string,
    version: string | null = null,
  ) {
    await manager.query(
      "INSERT INTO studio_audit_logs(organization_id,record_id,actor_user_id,action,version_id,request_id) VALUES($1,$2,$3,$4,$5,$6)",
      [
        org,
        record,
        request.sessionContext!.userId,
        action,
        version,
        request.requestId,
      ],
    );
  }
  async list(orgId: string, request: AuthRequest) {
    const permissions = await this.scope(
      this.database.source.manager,
      orgId,
      request,
      "read",
    );
    const rows = await this.database.source.query(
      `SELECT r.id,r.property_id,r.archived,r.updated_at,v.title,v.state,v.version FROM studio_records r JOIN LATERAL(SELECT title,state,version FROM studio_versions WHERE record_id=r.id ORDER BY version DESC LIMIT 1) v ON true WHERE r.organization_id=$1 ORDER BY r.updated_at DESC,r.id LIMIT 100`,
      [orgId],
    );
    return {
      data: rows.map((r: any) => ({
        id: r.id,
        propertyId: r.property_id,
        archived: r.archived,
        title: r.title,
        state: r.state,
        version: r.version,
        updatedAt: r.updated_at.toISOString(),
      })),
      permissions,
      limit: 100,
    };
  }
  async candidates(orgId: string, request: AuthRequest) {
    await this.scope(this.database.source.manager, orgId, request, "publish");
    const rows = await this.database.source.query(
      `SELECT p.id,p.on_chain_id,p.chain_name,c.chain_id,d.address FROM properties p JOIN contract_deployments d ON d.id=p.deployment_id JOIN chains c ON c.id=d.chain_id JOIN deployment_instances i ON i.id=p.deployment_instance_id JOIN indexer_cursors s ON s.instance_id=i.id WHERE p.source='blockchain' AND p.canonical_snapshot AND i.active AND c.chain_id=31337 AND d.owner_address=$1 AND s.status='synced' AND NOT EXISTS(SELECT 1 FROM studio_records r WHERE r.property_id=p.id) AND NOT EXISTS(SELECT 1 FROM property_metadata_versions v WHERE v.property_id=p.id) ORDER BY p.created_at,p.id LIMIT 100`,
      [Buffer.from(request.sessionContext!.address.slice(2), "hex")],
    );
    return {
      data: rows.map((p: any) => ({
        propertyId: p.id,
        onChainId: p.on_chain_id,
        name: p.chain_name,
        chainId: p.chain_id,
        contractAddress: "0x" + p.address.toString("hex"),
      })),
      note: "Candidate identities are indexed observations. Association checks live provenance, login chain and freshness.",
    };
  }
  async detail(orgId: string, id: string, request: AuthRequest) {
    return this.database.source.transaction(
      "REPEATABLE READ",
      async (manager) => {
        const permissions = await this.scope(manager, orgId, request, "read");
        const record = await this.record(manager, orgId, id);
        const versions = await manager.query(
          "SELECT * FROM studio_versions WHERE organization_id=$1 AND record_id=$2 ORDER BY version DESC",
          [orgId, id],
        );
        const assets = await manager.query(
          "SELECT id,original_name,mime_type,kind,byte_size,sha256,created_at FROM studio_assets WHERE organization_id=$1 AND record_id=$2 ORDER BY created_at",
          [orgId, id],
        );
        const links = await manager.query(
          "SELECT version_id,asset_id,purpose,alt_text,caption,display_order FROM studio_version_assets WHERE organization_id=$1 AND record_id=$2 ORDER BY display_order",
          [orgId, id],
        );
        const history = await manager.query(
          "SELECT action,version_id,actor_user_id,created_at FROM studio_audit_logs WHERE organization_id=$1 AND record_id=$2 ORDER BY created_at DESC LIMIT 100",
          [orgId, id],
        );
        let association = null;
        if (record.property_id) {
          const [p] = await manager.query(
            `SELECT p.id,p.on_chain_id,p.canonical_snapshot,i.active,c.chain_id,d.address FROM properties p JOIN contract_deployments d ON d.id=p.deployment_id JOIN chains c ON c.id=d.chain_id JOIN deployment_instances i ON i.id=p.deployment_instance_id WHERE p.id=$1`,
            [record.property_id],
          );
          if (p)
            association = {
              propertyId: p.id,
              onChainId: p.on_chain_id,
              chainId: p.chain_id,
              contractAddress: "0x" + p.address.toString("hex"),
              canonical: p.canonical_snapshot && p.active,
              note: "Indexed identity only; publication rechecks the live local chain.",
            };
        }
        return {
          data: {
            id,
            organizationId: orgId,
            propertyId: record.property_id,
            archived: record.archived,
            association,
            versions: versions.map((v: any) => ({
              id: v.id,
              version: v.version,
              revision: v.revision,
              state: v.state,
              title: v.title,
              location: v.location,
              description: v.description,
              characteristics: v.characteristics,
              publishedAt: v.published_at?.toISOString() ?? null,
              updatedAt: v.updated_at.toISOString(),
              assets: links
                .filter((l: any) => l.version_id === v.id)
                .map((l: any) => ({
                  assetId: l.asset_id,
                  purpose: l.purpose,
                  altText: l.alt_text,
                  caption: l.caption,
                })),
            })),
            assets: assets.map((a: any) => ({
              id: a.id,
              name: a.original_name,
              mimeType: a.mime_type,
              kind: a.kind,
              byteSize: a.byte_size,
              sha256: "0x" + a.sha256.toString("hex"),
            })),
            history: history.map((h: any) => ({
              action: h.action,
              versionId: h.version_id,
              actorUserId: h.actor_user_id,
              createdAt: h.created_at.toISOString(),
            })),
          },
          permissions,
        };
      },
    );
  }
  async create(org: string, body: DraftDto, request: AuthRequest) {
    return this.database.source.transaction(async (manager) => {
      await this.scope(manager, org, request, "edit", true);
      const [{ count }] = await manager.query(
        "SELECT count(*) FROM studio_records WHERE organization_id=$1",
        [org],
      );
      if (Number(count) >= 100)
        throw new ConflictException(
          "Local Studio limit is 100 records per organization",
        );
      const [r] = await manager.query(
        "INSERT INTO studio_records(organization_id,created_by) VALUES($1,$2) RETURNING id",
        [org, request.sessionContext!.userId],
      );
      const [v] = await manager.query(
        "INSERT INTO studio_versions(record_id,organization_id,version,title,location,description,characteristics,created_by) VALUES($1,$2,1,$3,$4,$5,$6,$7) RETURNING id",
        [
          r.id,
          org,
          body.title,
          body.location,
          body.description,
          JSON.stringify(body.characteristics),
          request.sessionContext!.userId,
        ],
      );
      await this.log(manager, request, org, r.id, "draft.created", v.id);
      return { id: r.id };
    });
  }
  async revise(org: string, id: string, request: AuthRequest) {
    return this.database.source.transaction(async (manager) => {
      await this.scope(manager, org, request, "edit", true);
      const r = await this.record(manager, org, id, true);
      const versions = await manager.query(
        "SELECT * FROM studio_versions WHERE record_id=$1 ORDER BY version DESC",
        [id],
      );
      if (versions.some((v: any) => v.state === "draft"))
        throw new ConflictException("A draft already exists");
      const v = versions[0];
      if (v.version >= 100)
        throw new ConflictException("Local version limit reached");
      const [next] = await manager.query(
        "INSERT INTO studio_versions(record_id,organization_id,version,title,location,description,characteristics,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [
          id,
          org,
          v.version + 1,
          v.title,
          v.location,
          v.description,
          v.characteristics,
          request.sessionContext!.userId,
        ],
      );
      await manager.query(
        "INSERT INTO studio_version_assets(version_id,asset_id,record_id,organization_id,purpose,alt_text,caption,display_order) SELECT $2,asset_id,record_id,organization_id,purpose,alt_text,caption,display_order FROM studio_version_assets WHERE version_id=$1",
        [v.id, next.id],
      );
      await manager.query(
        "UPDATE studio_records SET archived=false WHERE id=$1",
        [r.id],
      );
      await this.log(manager, request, org, id, "draft.created", next.id);
      return { id: next.id };
    });
  }
  private async draft(manager: EntityManager, id: string) {
    const [v] = await manager.query(
      `SELECT * FROM studio_versions WHERE record_id=$1 AND state='draft' FOR UPDATE`,
      [id],
    );
    if (!v)
      throw new ConflictException(
        "Create a new draft before editing or publishing",
      );
    return v;
  }
  async edit(
    org: string,
    id: string,
    body: EditDraftDto,
    request: AuthRequest,
  ) {
    return this.database.source.transaction(async (manager) => {
      await this.scope(manager, org, request, "edit", true);
      const r = await this.record(manager, org, id, true);
      if (r.archived)
        throw new ConflictException(
          "Create a revision to reopen an archived record",
        );
      const v = await this.draft(manager, id);
      if (v.revision !== body.expectedRevision)
        throw new ConflictException(
          "Draft changed in another tab; reload before editing",
        );
      if (
        new Set(body.assets.map((a) => a.assetId)).size !==
          body.assets.length ||
        body.assets.filter((a) => a.purpose === "hero").length > 1
      )
        throw new BadRequestException(
          "Attachments must be unique with at most one hero image",
        );
      for (const link of body.assets) {
        const [asset] = await manager.query(
          "SELECT kind FROM studio_assets WHERE id=$1 AND record_id=$2 AND organization_id=$3",
          [link.assetId, id, org],
        );
        if (!asset)
          throw new NotFoundException("Attachment not found in this record");
        if (
          (asset.kind === "document") !==
            (link.purpose === "supporting_document") ||
          (asset.kind === "image" && !link.altText.trim())
        )
          throw new BadRequestException(
            "Use image alt text and match attachment purpose to file type",
          );
      }
      await manager.query(
        "DELETE FROM studio_version_assets WHERE version_id=$1",
        [v.id],
      );
      for (const [index, link] of body.assets.entries())
        await manager.query(
          "INSERT INTO studio_version_assets(version_id,asset_id,record_id,organization_id,purpose,alt_text,caption,display_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            v.id,
            link.assetId,
            id,
            org,
            link.purpose,
            link.altText,
            link.caption,
            index,
          ],
        );
      await manager.query(
        "UPDATE studio_versions SET title=$2,location=$3,description=$4,characteristics=$5,revision=revision+1 WHERE id=$1",
        [
          v.id,
          body.title,
          body.location,
          body.description,
          body.characteristics,
        ],
      );
      await manager.query(
        "UPDATE studio_records SET updated_at=now() WHERE id=$1",
        [id],
      );
      await this.log(manager, request, org, id, "draft.updated", v.id);
      return { updated: true, revision: v.revision + 1 };
    });
  }
  async associate(
    org: string,
    id: string,
    propertyId: string,
    request: AuthRequest,
  ) {
    return this.database.source.transaction(async (manager) => {
      await this.scope(manager, org, request, "publish", true);
      const r = await this.record(manager, org, id, true);
      if (r.property_id || r.archived)
        throw new ConflictException(
          "Association is immutable; create another record after a reset",
        );
      await manager.query("SELECT id FROM properties WHERE id=$1 FOR UPDATE", [
        propertyId,
      ]);
      await this.provenance.check(manager, propertyId, request.sessionContext!);
      if (
        (
          await manager.query(
            "SELECT 1 FROM studio_records WHERE property_id=$1",
            [propertyId],
          )
        ).length
      )
        throw new ConflictException("Property is already managed");
      // Never silently claim or replace legacy operator content.
      if (
        (
          await manager.query(
            "SELECT 1 FROM property_metadata_versions WHERE property_id=$1",
            [propertyId],
          )
        ).length
      )
        throw new ConflictException(
          "Property has legacy metadata; an explicit reviewed migration is required",
        );
      await manager.query(
        "UPDATE studio_records SET property_id=$2 WHERE id=$1",
        [id, propertyId],
      );
      await this.log(manager, request, org, id, "record.associated");
      return { associated: true };
    });
  }
  async publish(
    org: string,
    id: string,
    body: PublishDto,
    request: AuthRequest,
  ) {
    return this.database.source.transaction(async (manager) => {
      await this.scope(manager, org, request, "publish", true);
      const r = await this.record(manager, org, id, true);
      const v = await this.draft(manager, id);
      if (r.archived || v.revision !== body.expectedRevision)
        throw new ConflictException(
          "Draft changed or record archived; reload before publishing",
        );
      if (!v.description.trim() || !v.location.trim())
        throw new BadRequestException(
          "Publication requires a location and description",
        );
      const links = await manager.query(
        "SELECT l.*,a.* FROM studio_version_assets l JOIN studio_assets a ON a.id=l.asset_id WHERE l.version_id=$1 ORDER BY l.display_order",
        [v.id],
      );
      for (const a of links) await this.integrity(a);
      let projection: string | null = null;
      if (r.property_id) {
        await manager.query(
          "SELECT id FROM properties WHERE id=$1 FOR UPDATE",
          [r.property_id],
        );
        await this.provenance.check(manager, r.property_id);
        const previous = await manager.query(
          "SELECT id FROM property_metadata_versions WHERE property_id=$1 AND state='published'",
          [r.property_id],
        );
        for (const p of previous)
          if (
            !(
              await manager.query(
                "SELECT 1 FROM studio_versions WHERE record_id=$1 AND projection_id=$2",
                [id, p.id],
              )
            ).length
          )
            throw new ConflictException(
              "Unmanaged metadata cannot be overwritten",
            );
        await manager.query(
          `UPDATE property_metadata_versions SET state='archived' WHERE property_id=$1 AND state='published'`,
          [r.property_id],
        );
        const [{ next }] = await manager.query(
          "SELECT coalesce(max(version),0)+1 AS next FROM property_metadata_versions WHERE property_id=$1",
          [r.property_id],
        );
        const [p] = await manager.query(
          "INSERT INTO property_metadata_versions(property_id,version,title,location,description,author_reference,characteristics) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
          [
            r.property_id,
            next,
            v.title,
            v.location,
            v.description,
            "studio:" + id,
            v.characteristics,
          ],
        );
        projection = p.id;
        for (const a of links) {
          await manager.query(
            `INSERT INTO public_assets(id,object_key,mime_type,byte_size,sha256,kind,state,created_by_reference) VALUES($1,$2,$3,$4,$5,$6,'published',$7) ON CONFLICT(id) DO NOTHING`,
            [
              a.asset_id,
              "studio/" + a.storage_key,
              a.mime_type,
              a.byte_size,
              a.sha256,
              a.kind,
              "studio:" + id,
            ],
          );
          await manager.query(
            "INSERT INTO property_assets(metadata_version_id,asset_id,purpose,alt_text,caption,display_order) VALUES($1,$2,$3,$4,$5,$6)",
            [
              projection,
              a.asset_id,
              a.purpose,
              a.alt_text,
              a.caption,
              a.display_order,
            ],
          );
        }
        await manager.query(
          `UPDATE property_metadata_versions SET state='published' WHERE id=$1`,
          [projection],
        );
      }
      await manager.query(
        `UPDATE studio_versions SET state='archived' WHERE record_id=$1 AND state='published'`,
        [id],
      );
      await manager.query(
        `UPDATE studio_versions SET state='published',published_by=$2,published_at=now(),projection_id=$3 WHERE id=$1`,
        [v.id, request.sessionContext!.userId, projection],
      );
      await manager.query(
        "UPDATE studio_records SET updated_at=now() WHERE id=$1",
        [id],
      );
      await this.log(manager, request, org, id, "metadata.published", v.id);
      return { published: true, publicCatalog: !!r.property_id };
    });
  }
  async archive(org: string, id: string, request: AuthRequest) {
    return this.database.source.transaction(async (manager) => {
      await this.scope(manager, org, request, "publish", true);
      const r = await this.record(manager, org, id, true);
      await manager.query(
        `UPDATE property_metadata_versions SET state='archived' WHERE id IN(SELECT projection_id FROM studio_versions WHERE record_id=$1) AND state='published'`,
        [id],
      );
      await manager.query(
        `UPDATE studio_versions SET state='archived' WHERE record_id=$1 AND state<>'archived'`,
        [id],
      );
      await manager.query(
        "UPDATE studio_records SET archived=true WHERE id=$1",
        [r.id],
      );
      await this.log(manager, request, org, id, "record.archived");
      return { archived: true };
    });
  }
  async upload(org: string, id: string, body: UploadDto, request: AuthRequest) {
    // Check tenant access before spending decoder CPU or writing any file.
    await this.scope(this.database.source.manager, org, request, "edit");
    await this.record(this.database.source.manager, org, id);
    const content = await validateFile(body.name, body.mimeType, body.base64);
    const key = await this.storage.put(content.bytes);
    try {
      return await this.database.source.transaction(async (manager) => {
        await this.scope(manager, org, request, "edit", true);
        const r = await this.record(manager, org, id, true);
        if (r.archived)
          throw new ConflictException("Archived records cannot receive files");
        await this.draft(manager, id);
        const [{ count }] = await manager.query(
          "SELECT count(*) FROM studio_assets WHERE record_id=$1",
          [id],
        );
        const [{ total }] = await manager.query(
          "SELECT coalesce(sum(byte_size),0) AS total FROM studio_assets WHERE organization_id=$1",
          [org],
        );
        if (
          Number(count) >= 40 ||
          Number(total) + content.bytes.length > 52428800
        )
          throw new ConflictException(
            "Local upload quota reached (40 files/record, 50 MiB/organization)",
          );
        const [a] = await manager.query(
          "INSERT INTO studio_assets(record_id,organization_id,storage_key,original_name,mime_type,kind,byte_size,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
          [
            id,
            org,
            key,
            content.name,
            content.mimeType,
            content.kind,
            content.bytes.length,
            checksum(content.bytes),
            request.sessionContext!.userId,
          ],
        );
        await this.log(manager, request, org, id, "asset.uploaded");
        return { id: a.id };
      });
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }
  }
  private async integrity(asset: any) {
    try {
      const bytes = await this.storage.read(asset.storage_key);
      if (
        bytes.length !== asset.byte_size ||
        !checksum(bytes).equals(asset.sha256)
      )
        throw new Error();
      return bytes;
    } catch {
      throw new ServiceUnavailableException(
        "Studio file is missing or failed integrity verification",
      );
    }
  }
  async privateAsset(
    org: string,
    id: string,
    assetId: string,
    request: AuthRequest,
  ) {
    await this.scope(this.database.source.manager, org, request, "read");
    await this.record(this.database.source.manager, org, id);
    const [a] = await this.database.source.query(
      "SELECT * FROM studio_assets WHERE id=$1 AND record_id=$2 AND organization_id=$3",
      [assetId, id, org],
    );
    if (!a) throw new NotFoundException("Asset not found");
    return { asset: a, bytes: await this.integrity(a) };
  }
  async publicAsset(assetId: string) {
    await this.database.requireReady();
    return this.database.source.transaction(
      "REPEATABLE READ",
      async (manager) => {
        const [a] = await manager.query(
          `SELECT a.*,r.property_id FROM studio_assets a JOIN studio_version_assets l ON l.asset_id=a.id JOIN studio_versions v ON v.id=l.version_id JOIN studio_records r ON r.id=v.record_id JOIN property_metadata_versions p ON p.id=v.projection_id WHERE a.id=$1 AND v.state='published' AND p.state='published' AND NOT r.archived LIMIT 1`,
          [assetId],
        );
        if (!a) throw new NotFoundException("Published asset not found");
        await this.provenance.check(manager, a.property_id);
        return { asset: a, bytes: await this.integrity(a) };
      },
    );
  }
}
