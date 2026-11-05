-- Do not silently merge historical property incarnations or delete their metadata.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM properties WHERE deployment_id IS NOT NULL GROUP BY deployment_id,on_chain_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Indexer rollback would collapse property history; restore a reviewed backup instead';
  END IF;
END $$;
DROP INDEX property_instance_idx;
DROP INDEX property_canonical_identity_idx;
DROP INDEX property_incarnation_identity_idx;
DROP INDEX property_unmanaged_identity_idx;
ALTER TABLE properties DROP CONSTRAINT property_instance_fk;
ALTER TABLE properties DROP CONSTRAINT property_snapshot_provenance;
ALTER TABLE properties DROP COLUMN canonical_snapshot, DROP COLUMN creation_block_hash, DROP COLUMN deployment_instance_id;
ALTER TABLE properties ADD UNIQUE(deployment_id,on_chain_id);
DROP TABLE indexer_cursors;
DROP TABLE chain_events;
DROP TABLE chain_blocks;
DROP TABLE deployment_instances;
