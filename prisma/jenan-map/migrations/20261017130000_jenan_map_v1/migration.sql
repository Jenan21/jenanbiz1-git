-- ADDITIVE ONLY. Requires a DBA-approved PostGIS installation. Never applied by app startup.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS jenan_map;

CREATE TABLE jenan_map.release (
  id uuid PRIMARY KEY,
  version text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Processing','Ready','Approved','Published','Archived','Failed')),
  source text NOT NULL,
  "sourceDate" timestamptz NOT NULL,
  license text NOT NULL,
  "createdBy" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedBy" text,
  "reviewedAt" timestamptz,
  "reviewNotes" text,
  "publishedAt" timestamptz,
  failure text
);
CREATE TABLE jenan_map.artifact (
  id uuid PRIMARY KEY,
  "releaseId" uuid NOT NULL REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('geojson','style','pmtiles','glyphs','schema','coverage','source')),
  "storageKey" text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime text NOT NULL,
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  "byteSize" bigint NOT NULL CHECK ("byteSize" > 0),
  "publicSafe" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT "publicSafe" OR kind <> 'source')
);
CREATE INDEX artifact_release_idx ON jenan_map.artifact("releaseId");
CREATE TABLE jenan_map.runtime (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('enabled','maintenance','disabled')),
  "maintenanceMessage" text,
  "publishedReleaseId" uuid REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
INSERT INTO jenan_map.runtime (id) VALUES (1);
CREATE TABLE jenan_map.feature (
  id uuid PRIMARY KEY,
  "releaseId" uuid NOT NULL REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  label text NOT NULL,
  category text NOT NULL,
  geometry geometry(Geometry,4326) NOT NULL,
  search tsvector NOT NULL,
  CHECK (ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry))
);
CREATE INDEX feature_release_idx ON jenan_map.feature("releaseId");
CREATE INDEX feature_geometry_idx ON jenan_map.feature USING gist(geometry);
CREATE INDEX feature_geography_idx ON jenan_map.feature USING gist((geometry::geography));
CREATE INDEX feature_search_idx ON jenan_map.feature USING gin(search);
CREATE TABLE jenan_map.boundary (
  id uuid PRIMARY KEY,
  "releaseId" uuid NOT NULL UNIQUE REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  authority text NOT NULL,
  source text NOT NULL,
  geometry geometry(MultiPolygon,4326) NOT NULL,
  CHECK (ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry))
);
CREATE INDEX boundary_geometry_idx ON jenan_map.boundary USING gist(geometry);
CREATE TABLE jenan_map.audit (
  id uuid PRIMARY KEY,
  "actorId" text NOT NULL,
  action text NOT NULL,
  "releaseId" uuid,
  metadata jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON jenan_map.audit("createdAt");

CREATE FUNCTION jenan_map.retain_rows() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Jenan Map records and immutable artifacts must be retained';
END $$;
CREATE TRIGGER retain_release BEFORE DELETE ON jenan_map.release FOR EACH ROW EXECUTE FUNCTION jenan_map.retain_rows();
CREATE TRIGGER retain_artifact BEFORE UPDATE OR DELETE ON jenan_map.artifact FOR EACH ROW EXECUTE FUNCTION jenan_map.retain_rows();
CREATE TRIGGER retain_audit BEFORE UPDATE OR DELETE ON jenan_map.audit FOR EACH ROW EXECUTE FUNCTION jenan_map.retain_rows();
CREATE FUNCTION jenan_map.guard_build_rows() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Jenan Map build records are immutable';
  END IF;
  SELECT status INTO release_status FROM jenan_map.release WHERE id = NEW."releaseId" FOR UPDATE;
  IF release_status <> 'Processing' THEN
    RAISE EXCEPTION 'Build writes require Processing release';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_feature BEFORE INSERT OR UPDATE OR DELETE ON jenan_map.feature FOR EACH ROW EXECUTE FUNCTION jenan_map.guard_build_rows();
CREATE TRIGGER guard_boundary BEFORE INSERT OR UPDATE OR DELETE ON jenan_map.boundary FOR EACH ROW EXECUTE FUNCTION jenan_map.guard_build_rows();
CREATE TRIGGER guard_artifact BEFORE INSERT ON jenan_map.artifact FOR EACH ROW EXECUTE FUNCTION jenan_map.guard_build_rows();
CREATE FUNCTION jenan_map.guard_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id <> NEW.id OR OLD.version <> NEW.version OR OLD.source <> NEW.source
     OR OLD."sourceDate" <> NEW."sourceDate" OR OLD.license <> NEW.license
     OR OLD."createdBy" <> NEW."createdBy" OR OLD."createdAt" <> NEW."createdAt" THEN
    RAISE EXCEPTION 'Release provenance is immutable';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'Draft' AND NEW.status = 'Processing') OR
    (OLD.status = 'Processing' AND NEW.status IN ('Ready','Failed')) OR
    (OLD.status = 'Ready' AND NEW.status IN ('Approved','Failed')) OR
    (OLD.status = 'Approved' AND NEW.status IN ('Published','Archived')) OR
    (OLD.status = 'Published' AND NEW.status = 'Archived') OR
    (OLD.status = 'Archived' AND NEW.status = 'Published' AND OLD."publishedAt" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Invalid Jenan Map release transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_release BEFORE UPDATE ON jenan_map.release FOR EACH ROW EXECUTE FUNCTION jenan_map.guard_release();
