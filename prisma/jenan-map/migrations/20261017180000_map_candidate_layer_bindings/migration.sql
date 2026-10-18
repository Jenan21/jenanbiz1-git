-- Browser asset/binding import complements offline geometry preparation.
-- Only unreviewed candidates accept new immutable binding provenance.
ALTER TABLE jenan_map.release_layer ADD COLUMN IF NOT EXISTS confidence double precision;
ALTER TABLE jenan_map.release_layer ADD CONSTRAINT release_layer_confidence_valid
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

CREATE OR REPLACE FUNCTION jenan_map.guard_layer_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Jenan Map layer bindings must be retained';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO release_status FROM jenan_map.release WHERE id = NEW."releaseId" FOR UPDATE;
    IF release_status IS NULL OR release_status NOT IN ('Draft', 'Processing', 'Ready') THEN
      RAISE EXCEPTION 'Layer bindings require an unreviewed candidate';
    END IF;
  ELSIF OLD."releaseId" <> NEW."releaseId" OR OLD."layerId" <> NEW."layerId"
      OR OLD.visibility <> NEW.visibility OR OLD.status <> NEW.status
      OR OLD."styleLayerIds" IS DISTINCT FROM NEW."styleLayerIds"
      OR OLD."searchCategories" IS DISTINCT FROM NEW."searchCategories"
      OR OLD.confidence IS DISTINCT FROM NEW.confidence THEN
    RAISE EXCEPTION 'Jenan Map release layer provenance is immutable';
  END IF;
  RETURN NEW;
END $$;
