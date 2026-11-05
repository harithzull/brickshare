CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_role varchar(24) NOT NULL DEFAULT 'investor' CHECK(platform_role IN ('investor','platform_admin')),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  display_name varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wallet_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  address bytea NOT NULL UNIQUE CHECK(octet_length(address)=20 AND address<>decode(repeat('00',20),'hex')),
  kind varchar(8) NOT NULL DEFAULT 'EOA' CHECK(kind='EOA'),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
CREATE INDEX wallets_user_idx ON wallet_identities(user_id);
CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address bytea NOT NULL CHECK(octet_length(address)=20), chain_id bigint NOT NULL CHECK(chain_id IN (31337,84532)),
  nonce_hash bytea NOT NULL UNIQUE CHECK(octet_length(nonce_hash)=32),
  binding_hash bytea NOT NULL CHECK(octet_length(binding_hash)=32),
  csrf_hash bytea NOT NULL CHECK(octet_length(csrf_hash)=32),
  message_hash bytea NOT NULL CHECK(octet_length(message_hash)=32),
  origin text NOT NULL, domain text NOT NULL, uri text NOT NULL,
  issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '10 minutes')
);
CREATE INDEX challenges_expiry_idx ON auth_challenges(expires_at);
CREATE INDEX challenges_binding_idx ON auth_challenges(binding_hash) WHERE consumed_at IS NULL;
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  wallet_id uuid NOT NULL, token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
  csrf_hash bytea NOT NULL CHECK(octet_length(csrf_hash)=32), chain_id bigint NOT NULL CHECK(chain_id IN (31337,84532)),
  origin text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(wallet_id,user_id) REFERENCES wallet_identities(id,user_id) ON DELETE RESTRICT,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '1 day')
);
CREATE INDEX sessions_user_active_idx ON sessions(user_id,expires_at) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL CHECK(length(btrim(name)) BETWEEN 3 AND 100),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role varchar(12) NOT NULL CHECK(role IN ('owner','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,user_id)
);
CREATE INDEX memberships_user_idx ON organization_memberships(user_id,organization_id);
CREATE INDEX memberships_role_idx ON organization_memberships(organization_id,role);
CREATE TABLE organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  address bytea NOT NULL CHECK(octet_length(address)=20 AND address<>decode(repeat('00',20),'hex')),
  role varchar(12) NOT NULL CHECK(role IN ('editor','viewer')),
  invited_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL, accepted_at timestamptz, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '7 days'),
  CHECK((accepted_at IS NULL)=(accepted_by_user_id IS NULL)), CHECK(accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE UNIQUE INDEX invitations_active_identity_idx ON organization_invitations(organization_id,address) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX invitations_inbox_idx ON organization_invitations(address,expires_at) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  subject_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(64) NOT NULL CHECK(action IN ('auth.challenge_issued','auth.login_succeeded','auth.login_failed','auth.logout','auth.platform_admin_granted','auth.platform_admin_revoked','organization.created','organization.updated','invitation.created','invitation.accepted','invitation.revoked','membership.role_changed','membership.removed')),
  request_id uuid, details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(details)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_organization_time_idx ON security_audit_logs(organization_id,created_at DESC,id);
CREATE INDEX audit_actor_time_idx ON security_audit_logs(actor_user_id,created_at DESC);
CREATE TABLE auth_rate_limits (
  bucket_hash bytea PRIMARY KEY CHECK(octet_length(bucket_hash)=32), count integer NOT NULL CHECK(count>0), expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_expiry_idx ON auth_rate_limits(expires_at);
CREATE FUNCTION audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Security audit history is append only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON security_audit_logs FOR EACH ROW EXECUTE FUNCTION audit_append_only();
CREATE FUNCTION membership_last_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='UPDATE' AND (NEW.organization_id<>OLD.organization_id OR NEW.user_id<>OLD.user_id OR NEW.id<>OLD.id) THEN RAISE EXCEPTION 'Membership identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.role='owner' AND (TG_OP='DELETE' OR NEW.role<>'owner') THEN
    PERFORM 1 FROM organizations WHERE id=OLD.organization_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=OLD.organization_id AND role='owner' AND id<>OLD.id) THEN RAISE EXCEPTION 'An organization requires an owner' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER membership_last_owner BEFORE UPDATE OR DELETE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION membership_last_owner();
CREATE FUNCTION organization_requires_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=NEW.id AND role='owner') THEN RAISE EXCEPTION 'An organization requires an owner' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER organization_requires_owner AFTER INSERT ON organizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION organization_requires_owner();
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER wallets_updated BEFORE UPDATE ON wallet_identities FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER organizations_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER memberships_updated BEFORE UPDATE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER invitations_updated BEFORE UPDATE ON organization_invitations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
