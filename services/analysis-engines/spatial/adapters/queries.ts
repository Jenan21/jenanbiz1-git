/**
 * Every statement the Map reader sends after it has opened its read-only snapshot. They are fixed text with positional parameters: nothing
 * is ever interpolated into them, a request cannot add SQL, and each one is a single SELECT (or WITH ... SELECT). A unit test reads this
 * file and rejects any statement that could write, lock, change a setting, or touch a table or column outside the Map read contract.
 *
 * Conventions: the Map's tables are always schema-qualified; geometry predicates run on the stored WGS84 geometry (planar, as the Map's
 * own lookups do) and distances run on geography (geodesic, metres); orderings that decide a LIMIT use COLLATE "C" so they do not depend on
 * the database's locale.
 */
export const QUERIES = {
  // ---------------------------------------------------------------------------------------------------------------- backend
  /** Whether PostGIS is installed, without raising an error when it is not. */
  postgisPresent: `SELECT to_regprocedure('postgis_lib_version()') IS NOT NULL AS "present"`,

  postgisVersions: `SELECT postgis_lib_version() AS "postgis", postgis_geos_version() AS "geos", postgis_proj_version() AS "proj"`,

  /** $1 schema, $2 table names. Every column of those tables, with its exact type, so the contract can be compared with what is there. */
  catalog: `SELECT c.relname AS "table", a.attname AS "column", format_type(a.atttypid, a.atttypmod) AS "type"
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = $1::text AND c.relname = ANY($2::text[]) AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname COLLATE "C", a.attnum`,

  /** $1 schema, $2 table names. What the connected role may do to the tables the adapter reads. */
  role: `SELECT r.rolsuper AS "superuser",
  COALESCE((SELECT pg_has_role(r.oid, w.oid, 'MEMBER') FROM pg_catalog.pg_roles w WHERE w.rolname = 'pg_write_all_data'), false) AS "writeAll",
  COALESCE(has_schema_privilege(r.oid, n.oid, 'USAGE'), false) AS "schemaUsage",
  COALESCE(bool_and(has_table_privilege(r.oid, c.oid, 'SELECT')), false) AS "canSelectAll",
  COALESCE(bool_or(has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE') OR has_any_column_privilege(r.oid, c.oid, 'INSERT, UPDATE')), false) AS "canWriteSome",
  count(c.oid)::int AS "tables"
FROM pg_catalog.pg_roles r
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = $1::text
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = ANY($2::text[]) AND c.relkind IN ('r', 'p')
WHERE r.rolname = current_user
GROUP BY r.oid, r.rolsuper, n.oid`,

  // ------------------------------------------------------------------------------------------------------------------ the Map
  runtime: `SELECT r."status" AS "status", r."publishedReleaseId"::text AS "publishedReleaseId"
FROM "jenan_map"."runtime" r
WHERE r."id" = 1`,

  /** $1 release id. Dates come back as UTC ISO 8601 text so no time zone is guessed on the way. */
  release: `SELECT r."id"::text AS "id", r."version" AS "version", r."status" AS "status", r."source" AS "source",
  to_char(r."sourceDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "sourceDate",
  r."license" AS "license",
  to_char(r."publishedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt"
FROM "jenan_map"."release" r
WHERE r."id" = $1::uuid`,

  /** $1 release id. The boundary's extent comes from the geometry header, so the polygon itself is not read. */
  boundary: `SELECT b."id"::text AS "id", b."authority" AS "authority", b."source" AS "source", b."coverage" AS "coverage",
  ST_XMin(b."geometry") AS "west", ST_YMin(b."geometry") AS "south", ST_XMax(b."geometry") AS "east", ST_YMax(b."geometry") AS "north"
FROM "jenan_map"."boundary" b
WHERE b."releaseId" = $1::uuid`,

  /** $1 release id, $2 layer ids. The display binding of each layer, if any, and whether the release holds features of it. */
  layers: `SELECT t."layerId" AS "layerId", l."enabled" AS "bindingEnabled", l."status" AS "bindingStatus", l."visibility" AS "bindingVisibility",
  EXISTS (SELECT 1 FROM "jenan_map"."feature" f WHERE f."releaseId" = $1::uuid AND f."layerId" = t."layerId") AS "hasFeatures"
FROM unnest($2::text[]) AS t("layerId")
LEFT JOIN "jenan_map"."release_layer" l ON l."releaseId" = $1::uuid AND l."layerId" = t."layerId"
ORDER BY t."layerId" COLLATE "C"`,

  // ------------------------------------------------------------------------------------------------------------------- geometry
  /** $1 GeoJSON texts. */
  geometryChecks: `  SELECT t."ordinal"::int AS "ordinal", ST_IsValid(g."geom") AND NOT ST_IsEmpty(g."geom") AND ST_SRID(g."geom") = 4326 AS "valid", ST_IsValidReason(g."geom") AS "reason"
FROM unnest($1::text[]) WITH ORDINALITY AS t("geojson", "ordinal")
CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_GeomFromGeoJSON(t."geojson"), 4326) AS "geom") g
ORDER BY t."ordinal"`,

  // ------------------------------------------------------------------------------------------------------------------- locating
  /**
   * $1 release id, $2 GeoJSON of the target. One row: the representative point, whether a boundary exists, whether it covers or touches the
   * target and, for an area that is only partly covered, the covered fraction of its area (computed on the sphere, only in that case).
   */
  locateCoverage: `WITH target AS (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326) AS geom
), anchor AS (
  SELECT t.geom, ST_PointOnSurface(t.geom) AS point, (ST_Dimension(t.geom) = 2) AS "isArea" FROM target t
)
SELECT ST_X(a.point) AS "anchorLongitude", ST_Y(a.point) AS "anchorLatitude",
  b."id" IS NOT NULL AS "hasBoundary",
  COALESCE(ST_Covers(b."geometry", a.geom), false) AS "covers",
  COALESCE(ST_Intersects(b."geometry", a.geom), false) AS "intersects",
  CASE
    WHEN b."id" IS NULL OR NOT a."isArea" THEN NULL
    WHEN ST_Covers(b."geometry", a.geom) OR NOT ST_Intersects(b."geometry", a.geom) THEN NULL
    ELSE ST_Area(ST_CollectionExtract(ST_Intersection(ST_MakeValid(ST_ClipByBox2D(b."geometry", ST_Envelope(a.geom))), a.geom), 3)::geography) / NULLIF(ST_Area(a.geom::geography), 0)
  END AS "fraction"
FROM anchor a
LEFT JOIN "jenan_map"."boundary" b ON b."releaseId" = $1::uuid`,

  /**
   * $1 release id, $2 GeoJSON of the target, $3 levels (layer ids), $4 rows to keep per level. The administrative polygons that intersect the
   * target, those covering its representative point first. The edge distance is measured only for the units that cover that point.
   */
  locateUnits: `WITH target AS (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326) AS geom
), anchor AS (
  SELECT t.geom, ST_PointOnSurface(t.geom) AS point FROM target t
), hits AS (
  SELECT f."layerId" AS "level", f."id"::text AS "id", f."label" AS "label",
    ST_Covers(f."geometry", a.point) AS "coversAnchor", ST_Covers(f."geometry", a.geom) AS "coversTarget",
    f."geometry" AS "unit", a.geom AS "target"
  FROM "jenan_map"."feature" f
  CROSS JOIN anchor a
  WHERE f."releaseId" = $1::uuid AND f."layerId" = ANY($3::text[]) AND ST_Intersects(f."geometry", a.geom)
), ranked AS (
  SELECT h.*, row_number() OVER (PARTITION BY h."level" ORDER BY h."coversAnchor" DESC, h."label" COLLATE "C", h."id") AS "rank"
  FROM hits h
)
SELECT r."level" AS "level", r."id" AS "id", r."label" AS "label", r."coversAnchor" AS "coversAnchor", r."coversTarget" AS "coversTarget",
  CASE WHEN r."coversAnchor" THEN ST_Distance(ST_Boundary(r."unit")::geography, r."target"::geography) END AS "edgeDistanceMeters",
  r."rank"::int AS "rank"
FROM ranked r
WHERE r."rank" <= $4::int
ORDER BY r."level" COLLATE "C", r."rank"`,

  // ------------------------------------------------------------------------------------------------------------------- nearest
  /**
   * $1 release id, $2 layer id, $3 GeoJSON of the target, $4 ring in metres, $5 pattern every recognized source id of the layer matches,
   * $6 pattern of the wanted kind, $7 rows to keep. Rows of the part "match" are the nearest features of the wanted kind within the ring, in
   * a total order (distance, then the id compared bytewise) so that features at the very same distance are always taken in the same order,
   * whatever the database's locale; the single row of the part "unrecognized" counts the features in the ring whose source id the strict
   * pattern does not recognize, and gives the distance of the nearest one. A feature whose kind cannot be read is never matched and never
   * skipped silently.
   */
  nearest: `WITH target AS (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($3::text), 4326)::geography AS geog
), near AS (
  SELECT f."id"::text AS "id", f."label" AS "label", f."sourceId" AS "sourceId", ST_Distance(f."geometry"::geography, t.geog) AS "distance"
  FROM "jenan_map"."feature" f
  CROSS JOIN target t
  WHERE f."releaseId" = $1::uuid AND f."layerId" = $2::text AND ST_DWithin(f."geometry"::geography, t.geog, $4::float8)
), matched AS (
  SELECT n."id", n."label", n."sourceId", n."distance"
  FROM near n
  WHERE n."sourceId" ~ $6::text
  ORDER BY n."distance", n."id" COLLATE "C"
  LIMIT $7::int
), ranked AS (
  SELECT m."id", m."label", m."sourceId", m."distance", row_number() OVER (ORDER BY m."distance", m."id" COLLATE "C") AS "rank"
  FROM matched m
), stray AS (
  SELECT count(*)::int AS "count", min(n."distance") AS "nearest"
  FROM near n
  WHERE n."sourceId" IS NULL OR n."sourceId" !~ $5::text
)
SELECT 'match' AS "part", r."id" AS "id", r."label" AS "label", r."sourceId" AS "sourceId", r."distance" AS "distance", NULL::int AS "count", r."rank"::int AS "rank" FROM ranked r
UNION ALL
SELECT 'unrecognized', NULL, NULL, NULL, s."nearest", s."count", 0 FROM stray s
ORDER BY "part", "rank"`,

  /** $1 release, $2 layer, $3 GeoJSON target, $4 radii, $5 recognized-kind pattern, $6 requested-kind pattern. */
  countFeatures: `WITH target AS (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($3::text), 4326)::geography AS geog
), radii AS (
  SELECT unnest($4::float8[]) AS radius
)
SELECT r.radius AS "radiusMeters",
  count(f."id") FILTER (WHERE f."sourceId" ~ $6::text)::int AS "count",
  count(f."id") FILTER (WHERE f."sourceId" IS NULL OR f."sourceId" !~ $5::text)::int AS "unrecognized"
FROM radii r
CROSS JOIN target t
LEFT JOIN "jenan_map"."feature" f ON f."releaseId" = $1::uuid AND f."layerId" = $2::text
  AND ST_DWithin(f."geometry"::geography, t.geog, r.radius)
GROUP BY r.radius
ORDER BY r.radius`,

  /** $1 a bounded GeoJSON feature array, $2 target, $3 radii, $4 max search, $5 nearest limit, $6 population calculation enabled. */
  measureDataset: `WITH raw AS (
  SELECT (item.ordinality - 1)::int AS "index", item.feature
  FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS item(feature, ordinality)
), features AS MATERIALIZED (
  SELECT r."index", r.feature,
    ST_SetSRID(ST_GeomFromGeoJSON(r.feature->'geometry'), 4326) AS geom
  FROM raw r
), validity AS MATERIALIZED (
  SELECT count(*) > 0 AND bool_and(ST_IsValid(f.geom)) AS valid
  FROM features f
), target AS MATERIALIZED (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326) AS geom
), distances AS MATERIALIZED (
  SELECT f."index", f.feature, ST_Distance(f.geom::geography, t.geom::geography) AS distance
  FROM features f
  CROSS JOIN target t
  CROSS JOIN validity v
  WHERE v.valid AND ST_DWithin(f.geom::geography, t.geom::geography, $4::float8)
), ranked AS (
  SELECT d.*, row_number() OVER (ORDER BY d.distance, d."index") AS rank
  FROM distances d
), radii AS (
  SELECT unnest($3::float8[]) AS radius
), catchments AS (
  SELECT r.radius,
    CASE WHEN (SELECT valid FROM validity) THEN (
      SELECT count(*)::int FROM features f CROSS JOIN target t
      WHERE ST_DWithin(f.geom::geography, t.geom::geography, r.radius)
    ) ELSE 0 END AS feature_count,
    CASE WHEN $6::boolean AND (SELECT valid FROM validity) THEN (
      SELECT sum(((f.feature->'properties'->>'population')::float8)
        * ST_Area(ST_CollectionExtract(ST_Intersection(
            f.geom, ST_Buffer(t.geom::geography, r.radius)::geometry
          ), 3)::geography)
        / NULLIF(ST_Area(f.geom::geography), 0))
      FROM features f CROSS JOIN target t
    ) END AS population_estimate
  FROM radii r
)
SELECT v.valid,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'index', ranked."index", 'id', nullif(ranked.feature->>'id', ''),
    'name', nullif(ranked.feature->'properties'->>'name', ''), 'distanceMeters', ranked.distance
  ) ORDER BY ranked.distance, ranked."index") FROM ranked WHERE ranked.rank <= $5::int), '[]'::jsonb) AS nearest,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'radiusMeters', c.radius, 'count', c.feature_count, 'populationEstimate', c.population_estimate
  ) ORDER BY c.radius) FROM catchments c), '[]'::jsonb) AS radii
FROM validity v`,

  /** Bounded analytical read: $1 features, $2 target, $3 radii, $4 search, $5 release, $6 layer, $7 recognized,
   * $8 wanted, $9 density enabled, $10 cell metres, $11 epsilon metres, $12 minimum points. */
  measureSpatial: `WITH target AS MATERIALIZED (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326) AS geom
), settings AS MATERIALIZED (
  SELECT t.geom, ST_Buffer(t.geom::geography, greatest($4::float8, (SELECT max(r) FROM unnest($3::float8[]) AS r)))::geometry AS search,
    '+proj=aeqd +datum=WGS84 +units=m +lat_0=' || ST_Y(ST_PointOnSurface(t.geom))::text
      || ' +lon_0=' || ST_X(ST_PointOnSurface(t.geom))::text AS projection
  FROM target t
), raw AS MATERIALIZED (
  SELECT (j.ordinality - 1)::text AS id, ST_GeomFromGeoJSON(j.feature->'geometry') AS geom, true AS recognized
  FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS j(feature, ordinality)
  UNION ALL
  SELECT f."id"::text AS id, f."geometry" AS geom, COALESCE(f."sourceId" ~ $7::text, false) AS recognized
  FROM "jenan_map"."feature" f CROSS JOIN settings s
  WHERE f."releaseId" = $5::uuid AND f."layerId" = $6::text AND f."geometry" && ST_Envelope(s.search)
    AND (f."sourceId" ~ $8::text OR f."sourceId" IS NULL OR f."sourceId" !~ $7::text)
  LIMIT 10001
), validity AS MATERIALIZED (
  SELECT count(*) <= 10000 AS bounded,
    COALESCE(bool_and(r.geom IS NOT NULL AND ST_IsValid(r.geom) AND NOT ST_IsEmpty(r.geom) AND ST_SRID(r.geom) = 4326
      AND ST_XMin(r.geom) >= -180 AND ST_XMax(r.geom) <= 180 AND ST_YMin(r.geom) >= -90 AND ST_YMax(r.geom) <= 90), true) AS valid
  FROM raw r
), usable AS MATERIALIZED (
  SELECT r.id, r.geom, r.recognized FROM raw r CROSS JOIN validity v WHERE v.valid AND v.bounded
), near AS MATERIALIZED (
  SELECT u.id, u.geom, u.recognized, ST_Distance(u.geom::geography, s.geom::geography) AS distance
  FROM usable u CROSS JOIN settings s
  WHERE ST_DWithin(u.geom::geography, s.geom::geography, greatest($4::float8, (SELECT max(r) FROM unnest($3::float8[]) AS r)))
), density_points AS MATERIALIZED (
  SELECT n.id, ST_Transform(n.geom, s.projection) AS geom
  FROM near n CROSS JOIN settings s
  WHERE $9::boolean AND n.recognized AND ST_GeometryType(n.geom) = 'ST_Point'
    AND n.distance <= (SELECT max(r) FROM unnest($3::float8[]) AS r)
), clustered AS MATERIALIZED (
  SELECT p.id, p.geom, ST_ClusterDBSCAN(p.geom, $11::float8, $12::int) OVER (ORDER BY p.id COLLATE "C") AS cluster_id
  FROM density_points p
), cells AS (
  SELECT floor(ST_X(p.geom) / $10::float8) AS x, floor(ST_Y(p.geom) / $10::float8) AS y, count(*)::int AS amount
  FROM density_points p GROUP BY x, y
), clusters AS (
  SELECT c.cluster_id, count(*)::int AS amount FROM clustered c WHERE c.cluster_id IS NOT NULL GROUP BY c.cluster_id
), radii AS (
  SELECT r AS radius, ST_Buffer(s.geom::geography, r)::geometry AS geom
  FROM unnest($3::float8[]) AS r CROSS JOIN settings s
), intersection_union AS (
  SELECT CASE WHEN NOT $9::boolean AND ST_Dimension(s.geom) = 2 THEN
    (SELECT ST_UnaryUnion(ST_Collect(ST_CollectionExtract(ST_Intersection(n.geom, s.geom), 3))) FROM near n
     WHERE n.recognized AND ST_Intersects(n.geom, s.geom))
  END AS geom FROM settings s
)
SELECT v.valid AND v.bounded AS valid, NOT v.bounded AS truncated,
  (SELECT count(*)::int FROM near n WHERE NOT n.recognized) AS unrecognized,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('radiusMeters', r.radius,
    'count', (SELECT count(*)::int FROM near n WHERE n.recognized AND n.distance <= r.radius),
    'areaKm2', ST_Area(r.geom::geography) / 1000000) ORDER BY r.radius) FROM radii r), '[]'::jsonb) AS radii,
  NOT EXISTS (SELECT 1 FROM near n WHERE n.recognized AND n.distance <= (SELECT max(r) FROM unnest($3::float8[]) AS r)
    AND ST_GeometryType(n.geom) <> 'ST_Point') AS "pointsOnly",
  (SELECT count(*)::int FROM cells) AS "occupiedCells",
  COALESCE((SELECT max(c.amount) FROM cells c), 0) AS "maxCellCount",
  (SELECT count(*)::int FROM clusters) AS "clusterCount",
  COALESCE((SELECT max(c.amount) FROM clusters c), 0) AS "largestCluster",
  (SELECT count(*)::int FROM clustered c WHERE c.cluster_id IS NULL) AS "noiseCount",
  (SELECT count(*)::int FROM near n CROSS JOIN target t WHERE n.recognized AND ST_Intersects(n.geom, t.geom)) AS intersects,
  (SELECT count(*)::int FROM near n CROSS JOIN target t WHERE n.recognized AND ST_Covers(n.geom, t.geom)) AS covers,
  COALESCE((SELECT ST_Area(o.geom::geography) / 1000000 FROM intersection_union o), 0) AS "overlapKm2",
  (SELECT min(n.distance) FROM near n WHERE n.recognized AND n.distance <= $4::float8) AS "nearestMeters"
FROM validity v`,
} as const;

export type QueryName = keyof typeof QUERIES;
