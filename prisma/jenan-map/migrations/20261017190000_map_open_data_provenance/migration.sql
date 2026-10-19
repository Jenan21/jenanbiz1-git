-- Additive only: no release promotion, data replacement, or change to existing app schemas.
ALTER TABLE jenan_map.boundary ADD COLUMN coverage jsonb;
ALTER TABLE jenan_map.feature ADD COLUMN "sourceId" text;
ALTER TABLE jenan_map.feature ADD COLUMN "layerId" text;
ALTER TABLE jenan_map.feature ADD COLUMN aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE jenan_map.release_layer ADD COLUMN provenance jsonb;

INSERT INTO jenan_map.layer (id, label) VALUES
  ('places', 'المدن والأماكن'),
  ('regions', 'المناطق — حدود غير رسمية'),
  ('governorates', 'المحافظات — حدود غير رسمية')
ON CONFLICT (id) DO NOTHING;

-- The existing guard still owns candidate-only insertion and immutable bindings.
CREATE FUNCTION jenan_map.guard_open_layer_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.provenance IS DISTINCT FROM NEW.provenance THEN
    RAISE EXCEPTION 'Jenan Map open-source provenance is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_open_layer_provenance BEFORE UPDATE ON jenan_map.release_layer
  FOR EACH ROW EXECUTE FUNCTION jenan_map.guard_open_layer_provenance();
