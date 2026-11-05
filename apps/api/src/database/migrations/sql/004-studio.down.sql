DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM studio_versions WHERE projection_id IS NOT NULL) THEN RAISE EXCEPTION 'Studio has published catalog projections; preserve history and use a forward migration' USING ERRCODE='23514'; END IF;
END $$;
DROP TABLE studio_audit_logs, studio_version_assets, studio_assets, studio_versions, studio_records;
DROP FUNCTION studio_asset_guard(), studio_link_guard(), studio_version_guard(), studio_record_guard();
DROP TRIGGER metadata_characteristics_guard ON property_metadata_versions;
DROP FUNCTION metadata_characteristics_guard();
ALTER TABLE property_metadata_versions DROP COLUMN characteristics;
