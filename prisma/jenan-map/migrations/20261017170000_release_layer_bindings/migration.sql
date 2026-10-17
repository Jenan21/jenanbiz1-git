-- Additive release-scoped bindings; existing unavailable catalog rows remain unavailable.
CREATE TABLE jenan_map.release_layer (
  "releaseId" uuid NOT NULL REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  "layerId" text NOT NULL REFERENCES jenan_map.layer(id) ON DELETE RESTRICT,
  visibility text NOT NULL CHECK (visibility IN ('public', 'internal')),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'unavailable', 'warning')),
  "styleLayerIds" text[] NOT NULL CHECK (cardinality("styleLayerIds") > 0),
  "searchCategories" text[] NOT NULL DEFAULT '{}',
  confidence double precision CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("releaseId", "layerId")
);

CREATE FUNCTION jenan_map.guard_layer_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Jenan Map layer bindings must be retained';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO release_status FROM jenan_map.release WHERE id = NEW."releaseId" FOR UPDATE;
    IF release_status IS DISTINCT FROM 'Processing' THEN
      RAISE EXCEPTION 'Layer bindings require Processing release';
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
CREATE TRIGGER guard_release_layer BEFORE INSERT OR UPDATE OR DELETE ON jenan_map.release_layer
  FOR EACH ROW EXECUTE FUNCTION jenan_map.guard_layer_binding();
