ALTER TABLE jenan_map.saved_location
  DROP CONSTRAINT saved_location_source_check;
ALTER TABLE jenan_map.saved_location
  ADD CONSTRAINT saved_location_source_check
  CHECK (source IN ('map', 'search', 'geolocation', 'coordinates'));

CREATE TABLE jenan_map.preference (
  "userId" text NOT NULL,
  "releaseId" uuid NOT NULL REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  radius integer NOT NULL CHECK (radius IN (500, 1000, 3000, 5000)),
  "visibleLayers" jsonb NOT NULL CHECK (jsonb_typeof("visibleLayers") = 'array'),
  viewport jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "releaseId")
);
