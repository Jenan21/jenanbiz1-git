CREATE TABLE jenan_map.release_layer (
  "releaseId" uuid NOT NULL REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  "layerId" text NOT NULL REFERENCES jenan_map.layer(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('unavailable', 'ready', 'warning')),
  visibility text NOT NULL CHECK (visibility IN ('public', 'internal')),
  source text NOT NULL,
  version text NOT NULL,
  "sourceDate" timestamptz NOT NULL,
  license text NOT NULL,
  "styleLayerIds" jsonb NOT NULL CHECK (jsonb_typeof("styleLayerIds") = 'array'),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("releaseId", "layerId")
);

CREATE INDEX release_layer_release_idx ON jenan_map.release_layer("releaseId");

CREATE FUNCTION jenan_map.guard_release_layer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Jenan Map release layer bindings are immutable';
  END IF;
  SELECT status INTO release_status FROM jenan_map.release WHERE id = NEW."releaseId" FOR UPDATE;
  IF release_status IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Release layer bindings require Processing release';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guard_release_layer
  BEFORE INSERT OR UPDATE OR DELETE ON jenan_map.release_layer
  FOR EACH ROW EXECUTE FUNCTION jenan_map.guard_release_layer();
