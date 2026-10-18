CREATE TABLE jenan_map.saved_location (
  "userId" text PRIMARY KEY,
  "releaseId" uuid NOT NULL REFERENCES jenan_map.release(id) ON DELETE RESTRICT,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  country text NOT NULL DEFAULT 'SA' CHECK (country = 'SA'),
  region text,
  city text,
  district text,
  "formattedAddress" text,
  source text NOT NULL CHECK (source IN ('map','search','coordinates')),
  "selectedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_location_release_idx ON jenan_map.saved_location("releaseId");
