ALTER TABLE property_metadata_versions ADD COLUMN characteristics jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(characteristics)='object');
CREATE FUNCTION metadata_characteristics_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.state<>'draft' AND NEW.characteristics<>OLD.characteristics THEN RAISE EXCEPTION 'Published characteristics are immutable' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER metadata_characteristics_guard BEFORE UPDATE ON property_metadata_versions FOR EACH ROW EXECUTE FUNCTION metadata_characteristics_guard();
CREATE TABLE studio_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 property_id uuid UNIQUE REFERENCES properties(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,organization_id)
);
CREATE INDEX studio_records_org_idx ON studio_records(organization_id,created_at,id);
CREATE TABLE studio_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL, organization_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 state varchar(12) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','archived')),
 title varchar(160) NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160),
 location varchar(200) NOT NULL DEFAULT '', description text NOT NULL DEFAULT '' CHECK(length(description)<=10000),
 characteristics jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(characteristics)='object'),
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 published_by uuid REFERENCES users(id) ON DELETE RESTRICT, published_at timestamptz,
 projection_id uuid UNIQUE REFERENCES property_metadata_versions(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(record_id,organization_id) REFERENCES studio_records(id,organization_id) ON DELETE RESTRICT,
 UNIQUE(record_id,version), UNIQUE(id,record_id,organization_id),
 CHECK((published_at IS NULL)=(published_by IS NULL)), CHECK(state<>'published' OR published_at IS NOT NULL)
);
CREATE UNIQUE INDEX studio_one_draft_idx ON studio_versions(record_id) WHERE state='draft';
CREATE UNIQUE INDEX studio_one_published_idx ON studio_versions(record_id) WHERE state='published';
CREATE INDEX studio_version_org_idx ON studio_versions(organization_id,record_id,version DESC);
CREATE TABLE studio_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL, organization_id uuid NOT NULL,
 storage_key uuid NOT NULL UNIQUE, original_name varchar(120) NOT NULL,
 mime_type varchar(100) NOT NULL CHECK(mime_type IN ('image/webp','application/pdf','text/plain')),
 kind varchar(12) NOT NULL CHECK(kind IN ('image','document')),
 byte_size integer NOT NULL CHECK(byte_size>0 AND byte_size<=1048576),
 sha256 bytea NOT NULL CHECK(octet_length(sha256)=32), created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(record_id,organization_id) REFERENCES studio_records(id,organization_id) ON DELETE RESTRICT,
 UNIQUE(id,record_id,organization_id), CHECK((kind='image')=(mime_type='image/webp'))
);
CREATE INDEX studio_assets_org_idx ON studio_assets(organization_id,record_id);
CREATE TABLE studio_version_assets (
 version_id uuid NOT NULL, asset_id uuid NOT NULL, record_id uuid NOT NULL, organization_id uuid NOT NULL,
 purpose varchar(30) NOT NULL CHECK(purpose IN ('hero','gallery','supporting_document')),
 alt_text varchar(240) NOT NULL DEFAULT '', caption varchar(240) NOT NULL DEFAULT '', display_order integer NOT NULL CHECK(display_order BETWEEN 0 AND 19),
 PRIMARY KEY(version_id,asset_id), UNIQUE(version_id,display_order),
 FOREIGN KEY(version_id,record_id,organization_id) REFERENCES studio_versions(id,record_id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(asset_id,record_id,organization_id) REFERENCES studio_assets(id,record_id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX studio_links_asset_idx ON studio_version_assets(asset_id);
CREATE FUNCTION studio_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.created_by<>OLD.created_by OR (OLD.property_id IS NOT NULL AND NEW.property_id IS DISTINCT FROM OLD.property_id) THEN RAISE EXCEPTION 'Studio ownership and existing association are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER studio_record_guard BEFORE UPDATE ON studio_records FOR EACH ROW EXECUTE FUNCTION studio_record_guard();
CREATE FUNCTION studio_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_version integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Studio history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM 1 FROM studio_records WHERE id=NEW.record_id FOR UPDATE;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM studio_versions WHERE record_id=NEW.record_id;
  IF NEW.version<>next_version OR NEW.state<>'draft' THEN RAISE EXCEPTION 'Studio versions start as sequential drafts' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.record_id<>OLD.record_id OR NEW.organization_id<>OLD.organization_id OR NEW.version<>OLD.version OR NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION 'Studio version identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state<>'draft' AND (NEW.title<>OLD.title OR NEW.location<>OLD.location OR NEW.description<>OLD.description OR NEW.characteristics<>OLD.characteristics OR NEW.revision<>OLD.revision OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_by IS DISTINCT FROM OLD.published_by OR NEW.projection_id IS DISTINCT FROM OLD.projection_id OR NEW.state<>'archived') THEN RAISE EXCEPTION 'Studio published history is immutable' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER studio_version_guard BEFORE INSERT OR UPDATE OR DELETE ON studio_versions FOR EACH ROW EXECUTE FUNCTION studio_version_guard();
CREATE FUNCTION studio_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; version_state text;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Replace draft attachment links explicitly' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN target=OLD.version_id; ELSE target=NEW.version_id; END IF;
 SELECT state INTO version_state FROM studio_versions WHERE id=target FOR UPDATE;
 IF version_state<>'draft' THEN RAISE EXCEPTION 'Published attachments are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER studio_link_guard BEFORE INSERT OR UPDATE OR DELETE ON studio_version_assets FOR EACH ROW EXECUTE FUNCTION studio_link_guard();
CREATE FUNCTION studio_asset_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Studio asset content is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER studio_asset_guard BEFORE UPDATE OR DELETE ON studio_assets FOR EACH ROW EXECUTE FUNCTION studio_asset_guard();
CREATE TRIGGER studio_records_updated BEFORE UPDATE ON studio_records FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER studio_versions_updated BEFORE UPDATE ON studio_versions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
-- A separate append-only tenant audit avoids rewriting Phase 2C's action allowlist.
CREATE TABLE studio_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), record_id uuid NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES users(id), action varchar(32) NOT NULL CHECK(action IN ('draft.created','draft.updated','record.associated','metadata.published','record.archived','asset.uploaded')),
 version_id uuid REFERENCES studio_versions(id), request_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(record_id,organization_id) REFERENCES studio_records(id,organization_id)
);
CREATE INDEX studio_audit_org_idx ON studio_audit_logs(organization_id,record_id,created_at DESC);
CREATE TRIGGER studio_audit_append_only BEFORE UPDATE OR DELETE ON studio_audit_logs FOR EACH ROW EXECUTE FUNCTION audit_append_only();
