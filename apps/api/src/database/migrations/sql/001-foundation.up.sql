CREATE TABLE chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id bigint NOT NULL UNIQUE CHECK (chain_id > 0),
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  explorer_url text CHECK (explorer_url IS NULL OR explorer_url ~ '^https://[^[:space:]]+$'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE contract_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE RESTRICT,
  address bytea NOT NULL CHECK (octet_length(address)=20 AND address<>decode(repeat('00',20),'hex')),
  deployment_block bigint NOT NULL CHECK (deployment_block >= 0),
  deployment_block_hash bytea NOT NULL CHECK (octet_length(deployment_block_hash)=32),
  transaction_hash bytea NOT NULL CHECK (octet_length(transaction_hash)=32),
  owner_address bytea NOT NULL CHECK (octet_length(owner_address)=20),
  artifact_hash bytea NOT NULL CHECK (octet_length(artifact_hash)=32),
  abi_version varchar(100) NOT NULL CHECK (length(btrim(abi_version)) > 0),
  release_reference varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain_id,address)
);
CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source varchar(20) NOT NULL CHECK (source IN ('blockchain','fictional')),
  fixture_label text,
  deployment_id uuid REFERENCES contract_deployments(id) ON DELETE RESTRICT,
  on_chain_id numeric(78,0), chain_name text, chain_location text,
  total_tokens numeric(78,0), available_tokens numeric(78,0), token_price_wei numeric(78,0), active boolean,
  observed_block bigint, observed_block_hash bytea,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_source_integrity CHECK (
    (source='fictional' AND length(btrim(fixture_label))>0 AND fixture_label IS NOT NULL
      AND deployment_id IS NULL AND on_chain_id IS NULL AND chain_name IS NULL AND chain_location IS NULL
      AND total_tokens IS NULL AND available_tokens IS NULL AND token_price_wei IS NULL AND active IS NULL AND observed_block IS NULL AND observed_block_hash IS NULL)
    OR
    (source='blockchain' AND fixture_label IS NULL AND deployment_id IS NOT NULL
      AND on_chain_id IS NOT NULL AND chain_name IS NOT NULL AND chain_location IS NOT NULL
      AND total_tokens IS NOT NULL AND available_tokens IS NOT NULL AND token_price_wei IS NOT NULL
      AND active IS NOT NULL AND observed_block IS NOT NULL AND observed_block_hash IS NOT NULL)
  ),
  CONSTRAINT property_uint256 CHECK (
    on_chain_id BETWEEN 1 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935
    AND total_tokens BETWEEN 1 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935
    AND available_tokens BETWEEN 0 AND total_tokens
    AND token_price_wei BETWEEN 1 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935
    AND observed_block >= 0 AND octet_length(observed_block_hash)=32
  ),
  UNIQUE(deployment_id,on_chain_id)
);
CREATE INDEX properties_source_created_idx ON properties(source,created_at,id);
CREATE INDEX properties_deployment_status_idx ON properties(deployment_id,active);
CREATE INDEX properties_location_idx ON properties(chain_location);
CREATE INDEX properties_search_idx ON properties USING gin(to_tsvector('simple',coalesce(chain_name,'') || ' ' || coalesce(chain_location,'')));
CREATE TABLE property_metadata_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version>0),
  state varchar(20) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  title text, location text, description text, author_reference varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id,version)
);
CREATE UNIQUE INDEX metadata_one_published_idx ON property_metadata_versions(property_id) WHERE state='published';
CREATE INDEX metadata_published_lookup_idx ON property_metadata_versions(property_id,state,version DESC);
CREATE TABLE public_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key text NOT NULL UNIQUE CHECK (object_key ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]*$' AND object_key !~ '(^|/)\.{1,2}(/|$)'),
  mime_type varchar(100) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf','text/plain')),
  byte_size bigint NOT NULL CHECK (byte_size>0 AND byte_size<=20971520),
  sha256 bytea NOT NULL CHECK (octet_length(sha256)=32),
  kind varchar(20) NOT NULL CHECK (kind IN ('image','document')),
  state varchar(20) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  created_by_reference varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='image' AND mime_type LIKE 'image/%') OR (kind='document' AND mime_type IN ('application/pdf','text/plain')))
);
CREATE TABLE property_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metadata_version_id uuid NOT NULL REFERENCES property_metadata_versions(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public_assets(id) ON DELETE RESTRICT,
  purpose varchar(40) NOT NULL CHECK (purpose IN ('hero','gallery','supporting_document')),
  alt_text text, caption text,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order>=0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(metadata_version_id,asset_id)
);
CREATE INDEX property_assets_order_idx ON property_assets(metadata_version_id,display_order,id);
CREATE INDEX property_assets_asset_idx ON property_assets(asset_id);

CREATE FUNCTION metadata_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_version integer;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Metadata version history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    PERFORM 1 FROM properties WHERE id=NEW.property_id FOR UPDATE;
    SELECT coalesce(max(version),0)+1 INTO expected_version FROM property_metadata_versions WHERE property_id=NEW.property_id;
    IF NEW.version<>expected_version THEN RAISE EXCEPTION 'Metadata versions must be sequential' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.id<>OLD.id OR NEW.property_id<>OLD.property_id OR NEW.version<>OLD.version THEN RAISE EXCEPTION 'Metadata version identity is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state<>'draft' AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.location IS DISTINCT FROM OLD.location OR NEW.description IS DISTINCT FROM OLD.description OR NEW.author_reference IS DISTINCT FROM OLD.author_reference OR NEW.state<>'archived') THEN
      RAISE EXCEPTION 'Published and archived metadata is immutable except archival' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER metadata_version_guard BEFORE INSERT OR UPDATE OR DELETE ON property_metadata_versions FOR EACH ROW EXECUTE FUNCTION metadata_version_guard();

-- Content and attachment references of published versions remain reproducible.
CREATE FUNCTION metadata_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_state text; asset_kind text;
BEGIN
  IF TG_OP<>'INSERT' THEN
    SELECT state INTO version_state FROM property_metadata_versions WHERE id=OLD.metadata_version_id FOR UPDATE;
    IF version_state<>'draft' THEN RAISE EXCEPTION 'Published metadata links are immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT state INTO version_state FROM property_metadata_versions WHERE id=NEW.metadata_version_id FOR UPDATE;
  IF version_state<>'draft' THEN RAISE EXCEPTION 'Attachments require a draft metadata version' USING ERRCODE='23514'; END IF;
  SELECT kind INTO asset_kind FROM public_assets WHERE id=NEW.asset_id;
  IF (NEW.purpose='supporting_document' AND asset_kind<>'document') OR (NEW.purpose IN ('hero','gallery') AND (asset_kind<>'image' OR coalesce(length(btrim(NEW.alt_text)),0)=0)) THEN
    RAISE EXCEPTION 'Asset purpose, kind and alt text must agree' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER metadata_link_guard BEFORE INSERT OR UPDATE OR DELETE ON property_assets FOR EACH ROW EXECUTE FUNCTION metadata_link_guard();

CREATE FUNCTION published_asset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state<>'draft' AND (NEW.id<>OLD.id OR NEW.object_key<>OLD.object_key OR NEW.mime_type<>OLD.mime_type OR NEW.byte_size<>OLD.byte_size OR NEW.sha256<>OLD.sha256 OR NEW.kind<>OLD.kind OR NEW.created_by_reference IS DISTINCT FROM OLD.created_by_reference OR NEW.state NOT IN (OLD.state,'archived')) THEN
    RAISE EXCEPTION 'Published asset identity and content are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER published_asset_guard BEFORE UPDATE ON public_assets FOR EACH ROW EXECUTE FUNCTION published_asset_guard();

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER chains_updated BEFORE UPDATE ON chains FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER deployments_updated BEFORE UPDATE ON contract_deployments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER properties_updated BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER metadata_updated BEFORE UPDATE ON property_metadata_versions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER assets_updated BEFORE UPDATE ON public_assets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER links_updated BEFORE UPDATE ON property_assets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
