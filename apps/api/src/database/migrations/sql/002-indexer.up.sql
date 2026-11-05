-- A local address may be reused after reset; each verified incarnation is isolated.
CREATE TABLE deployment_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES contract_deployments(id) ON DELETE RESTRICT,
  fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),
  hardhat_instance_id bytea NOT NULL CHECK(octet_length(hardhat_instance_id)=32),
  genesis_hash bytea NOT NULL CHECK(octet_length(genesis_hash)=32),
  deployment_block bigint NOT NULL CHECK(deployment_block>=1),
  deployment_block_hash bytea NOT NULL CHECK(octet_length(deployment_block_hash)=32),
  transaction_hash bytea NOT NULL CHECK(octet_length(transaction_hash)=32),
  runtime_hash bytea NOT NULL CHECK(octet_length(runtime_hash)=32),
  abi_hash bytea NOT NULL CHECK(octet_length(abi_hash)=32),
  owner_address bytea NOT NULL CHECK(octet_length(owner_address)=20),
  release_reference varchar(160),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(deployment_id,fingerprint), UNIQUE(id,deployment_id)
);
CREATE UNIQUE INDEX instance_one_active_idx ON deployment_instances(deployment_id) WHERE active;
CREATE TABLE chain_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES deployment_instances(id) ON DELETE RESTRICT,
  block_number bigint NOT NULL CHECK(block_number>=0),
  block_hash bytea NOT NULL CHECK(octet_length(block_hash)=32),
  parent_hash bytea NOT NULL CHECK(octet_length(parent_hash)=32),
  block_timestamp timestamptz NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(instance_id,block_hash), UNIQUE(instance_id,block_number,block_hash)
);
CREATE UNIQUE INDEX block_one_canonical_idx ON chain_blocks(instance_id,block_number) WHERE canonical;
CREATE TABLE chain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES deployment_instances(id) ON DELETE RESTRICT,
  block_number bigint NOT NULL, block_hash bytea NOT NULL,
  transaction_hash bytea NOT NULL CHECK(octet_length(transaction_hash)=32),
  transaction_index integer NOT NULL CHECK(transaction_index>=0),
  log_index integer NOT NULL CHECK(log_index>=0),
  event_name varchar(40) NOT NULL CHECK(event_name IN ('PropertyCreated','TokensPurchased','TokensTransferred','PropertyStatusChanged','FundsWithdrawn')),
  topics jsonb NOT NULL CHECK(jsonb_typeof(topics)='array'),
  data text NOT NULL CHECK(data ~ '^0x([a-fA-F0-9]{2})*$'),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  canonical boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(instance_id,block_number,block_hash) REFERENCES chain_blocks(instance_id,block_number,block_hash) ON DELETE RESTRICT,
  UNIQUE(instance_id,block_hash,transaction_hash,log_index), UNIQUE(instance_id,block_hash,log_index)
);
CREATE INDEX events_replay_idx ON chain_events(instance_id,block_number,transaction_index,log_index) WHERE canonical;
CREATE TABLE indexer_cursors (
  instance_id uuid PRIMARY KEY REFERENCES deployment_instances(id) ON DELETE RESTRICT,
  last_scanned_block bigint CHECK(last_scanned_block>=0),
  last_scanned_hash bytea CHECK(octet_length(last_scanned_hash)=32),
  observed_head bigint CHECK(observed_head>=0),
  status varchar(20) NOT NULL DEFAULT 'initializing' CHECK(status IN ('initializing','syncing','synced','error','invalidated')),
  finality_policy text NOT NULL DEFAULT 'local-latest-unfinalized' CHECK(finality_policy='local-latest-unfinalized'),
  error_code varchar(64), reorg_count integer NOT NULL DEFAULT 0 CHECK(reorg_count>=0),
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
  last_attempt_at timestamptz, last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((last_scanned_block IS NULL)=(last_scanned_hash IS NULL)),
  FOREIGN KEY(instance_id,last_scanned_block,last_scanned_hash) REFERENCES chain_blocks(instance_id,block_number,block_hash) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE properties ADD COLUMN deployment_instance_id uuid;
ALTER TABLE properties ADD COLUMN creation_block_hash bytea CHECK(octet_length(creation_block_hash)=32);
ALTER TABLE properties ADD COLUMN canonical_snapshot boolean NOT NULL DEFAULT false;
ALTER TABLE properties ADD CONSTRAINT property_instance_fk FOREIGN KEY(deployment_instance_id,deployment_id) REFERENCES deployment_instances(id,deployment_id) ON DELETE RESTRICT;
ALTER TABLE properties ADD CONSTRAINT property_snapshot_provenance CHECK(
  (deployment_instance_id IS NULL AND creation_block_hash IS NULL AND NOT canonical_snapshot)
  OR (source='blockchain' AND deployment_instance_id IS NOT NULL AND creation_block_hash IS NOT NULL)
);
ALTER TABLE properties DROP CONSTRAINT properties_deployment_id_on_chain_id_key;
CREATE UNIQUE INDEX property_unmanaged_identity_idx ON properties(deployment_id,on_chain_id) WHERE deployment_instance_id IS NULL;
CREATE UNIQUE INDEX property_incarnation_identity_idx ON properties(deployment_instance_id,on_chain_id,creation_block_hash);
CREATE UNIQUE INDEX property_canonical_identity_idx ON properties(deployment_instance_id,on_chain_id) WHERE canonical_snapshot;
CREATE INDEX property_instance_idx ON properties(deployment_instance_id,canonical_snapshot);
CREATE TRIGGER instances_updated BEFORE UPDATE ON deployment_instances FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER blocks_updated BEFORE UPDATE ON chain_blocks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER events_updated BEFORE UPDATE ON chain_events FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER cursors_updated BEFORE UPDATE ON indexer_cursors FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
