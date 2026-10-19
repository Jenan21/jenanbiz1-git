-- Imported artifacts remain immutable; only unreviewed candidates accept additions.
ALTER TABLE jenan_map.artifact DROP CONSTRAINT artifact_kind_check;
ALTER TABLE jenan_map.artifact ADD CONSTRAINT artifact_kind_check
  CHECK (kind IN ('geojson','style','pmtiles','glyphs','sprite','schema','coverage','source'));
ALTER TABLE jenan_map.artifact ADD COLUMN "exportAllowed" boolean NOT NULL DEFAULT false;
ALTER TABLE jenan_map.artifact ADD COLUMN "exportLicense" text;
CREATE FUNCTION jenan_map.guard_artifact_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release_status text;
BEGIN
  SELECT status INTO release_status FROM jenan_map.release WHERE id = NEW."releaseId" FOR UPDATE;
  IF release_status NOT IN ('Draft','Processing','Ready') THEN
    RAISE EXCEPTION 'Artifact import requires an unreviewed candidate';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER guard_artifact ON jenan_map.artifact;
CREATE TRIGGER guard_artifact BEFORE INSERT ON jenan_map.artifact
  FOR EACH ROW EXECUTE FUNCTION jenan_map.guard_artifact_insert();
CREATE UNIQUE INDEX artifact_release_filename_unique ON jenan_map.artifact ("releaseId", filename)
  WHERE kind <> 'source';
