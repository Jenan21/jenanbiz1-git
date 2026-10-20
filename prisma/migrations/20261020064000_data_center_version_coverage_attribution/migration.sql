-- Structured geographic coverage and attribution on immutable Data Center versions.
-- Coverage is plain WGS84 metadata (ISO country/region codes and a west/south/east/north box); there is no PostGIS or geometry here.
-- "Not declared" is represented by empty arrays and NULL box values, never by a fabricated worldwide extent.
ALTER TABLE "DataCenterVersion"
  ADD COLUMN "attribution" TEXT,
  ADD COLUMN "coverageCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "coverageRegions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "bboxWest" DOUBLE PRECISION,
  ADD COLUMN "bboxSouth" DOUBLE PRECISION,
  ADD COLUMN "bboxEast" DOUBLE PRECISION,
  ADD COLUMN "bboxNorth" DOUBLE PRECISION;

-- CHECK constraints cannot contain subqueries, so the per-element rules live in immutable helper functions.
CREATE FUNCTION "data_center_codes_match"(codes TEXT[], pattern TEXT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(codes) AS code WHERE code IS NULL OR code !~ pattern)
$$;
CREATE FUNCTION "data_center_regions_within"(regions TEXT[], countries TEXT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(regions) AS region WHERE NOT (left(region, 2) = ANY (countries)))
$$;

ALTER TABLE "DataCenterVersion"
  ADD CONSTRAINT "DataCenterVersion_attribution_check" CHECK ("attribution" IS NULL OR length(btrim("attribution")) BETWEEN 1 AND 1000),
  ADD CONSTRAINT "DataCenterVersion_coverage_countries_check" CHECK (
    cardinality("coverageCountries") <= 250 AND "data_center_codes_match"("coverageCountries", '^[A-Z]{2}$')
  ),
  ADD CONSTRAINT "DataCenterVersion_coverage_regions_check" CHECK (
    cardinality("coverageRegions") <= 500
    AND "data_center_codes_match"("coverageRegions", '^[A-Z]{2}-[A-Z0-9]{1,3}$')
    AND "data_center_regions_within"("coverageRegions", "coverageCountries")
  ),
  -- All four box values or none; west <= east (no antimeridian crossing in v1) and south <= north.
  ADD CONSTRAINT "DataCenterVersion_coverage_bbox_check" CHECK (
    ("bboxWest" IS NULL AND "bboxSouth" IS NULL AND "bboxEast" IS NULL AND "bboxNorth" IS NULL)
    OR ("bboxWest" IS NOT NULL AND "bboxSouth" IS NOT NULL AND "bboxEast" IS NOT NULL AND "bboxNorth" IS NOT NULL
        AND "bboxWest" BETWEEN -180 AND 180 AND "bboxEast" BETWEEN -180 AND 180
        AND "bboxSouth" BETWEEN -90 AND 90 AND "bboxNorth" BETWEEN -90 AND 90
        AND "bboxWest" <= "bboxEast" AND "bboxSouth" <= "bboxNorth")
  );
