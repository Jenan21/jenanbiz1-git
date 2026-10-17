# Jenan PRO Map | جنان برو ماب — implementation record

## Architecture inspection (2026-10-17)

This is an independent, **not yet accepted** Saudi-only implementation. It does not replace the existing Leaflet project picker, project geocoder, project analysis, frozen homepage, or authentication. The task branch is `copilot/jenan-map-implementation`; PR #24 already exists. `origin/main` was fetched before edits and remained `6b264624ef298d40fe1f9efef0e8d4c6521d2402`, an ancestor of the task branch. No merge, production migration, dataset publication, live rollback, or deployment is authorized by this implementation.

Actual repository findings:

- Next/React/TypeScript with Prisma 7 PostgreSQL adapter; Redis and existing workers remain intact.
- Existing `/api/admin/map-provider` uses `getCurrentUser`, `hasPlatformAdminAccess`, `hasValidOrigin`, Zod and `auditLog`. It remains a separate feature.
- Existing `compose.yaml` uses PostgreSQL 17 without PostGIS. Its named volume and backup-expiry job must not be repurposed for map artifacts.
- The nonce CSP already permits same-origin connections/workers and local fonts. No global CSP relaxation is needed.
- No installed dependencies or local `.env` were present at inspection. Host Node was 22, while the project requires Node 24. About 85 GiB disk was available. Disk capacity alone does not establish that a Saudi tile build can finish.
- Current GitHub verification run 39033514676 is `action_required`, with no jobs/logs; this is not a passing or failing test result.

## Decisions and boundaries

Use MapLibre GL JS + PMTiles, OpenStreetMap-derived immutable artifacts, PostgreSQL/PostGIS, and a controlled private artifact store with same-origin streaming. A mounted filesystem is the initial storage adapter, not a claim of configured object storage/CDN. A compatible deployment may substitute controlled object storage behind the same artifact contract. No runtime public tile service or external geocoder fallback is allowed.

MapLibre GL JS **6.14.0** and PMTiles **4.5.0** were checked against the advisory database before installation (no advisories reported). Attempts to retrieve the official PMTiles, MapLibre and PostGIS documentation were blocked by DNS in the sandbox. Installed package types were inspected: MapLibre 6 exports a module worker, `setWorkerUrl`, and built-in RTL text drawing; its older RTL plugin API is deprecated. `npm run jenan-map:assets` copies that exact locked worker and its BSD license into ignored public build assets, and runs before development/build and in `vercel-build`. No third-party runtime CDN or RTL plugin is required. Compatibility remains subject to actual Arabic renderer acceptance, not merely dependency installation.

Official source examples were subsequently reachable through GitHub: [MapLibre PMTiles protocol example](https://github.com/maplibre/maplibre-gl-js/blob/main/test/examples/pmtiles-source-and-protocol.html) (blob `a19df873357dc377b380ad8fedcea29003d9064d`) and [PMTiles advanced MapLibre example](https://github.com/protomaps/PMTiles/blob/main/js/examples/maplibre_advanced.html) (blob `5444b2ea84c6851e6f6f17fd5217c139bb86dfd1`, referencing PMTiles 4.5.0). These confirm the `Protocol`/`addProtocol`/`pmtiles://` interface. Their external demo URLs/CDN scripts are **not** production dependencies or Saudi data sources for this feature.

Independent surfaces: `/jenan-map`, `/admin/jenan-map`, `/api/jenan-map/*`, `/api/admin/jenan-map/*`. Existing project coordinates are adapted, not migrated or activated in existing services. New schema objects are additive. PostGIS migration requires an extension-capable development database and operator review; never run it against production during this task.

### Opt-in infrastructure setup

`compose.jenan-map.yaml` uses its own project, network and volume. It does not override the existing `compose.yaml`. Set a unique local `JENAN_MAP_DEV_DB_PASSWORD` and start it explicitly with `docker compose -f compose.jenan-map.yaml up -d`. Do not use `down -v`, attach existing volumes, or repoint the application at this database by accident.

The map migration chain is isolated under `prisma/jenan-map/migrations`, with **`prisma.jenan-map.config.ts`**. Ordinary application `db:migrate` does not install PostGIS or map tables. Only an operator with a reviewed **disposable development** URL should explicitly run:

```sh
DATABASE_URL="<disposable-development-database-url>" node_modules/.bin/prisma migrate deploy --config prisma.jenan-map.config.ts
DATABASE_URL="<disposable-development-database-url>" node_modules/.bin/prisma validate --config prisma.jenan-map.config.ts
```

The app's existing identity/audit schema must also exist in that development database for authenticated integration tests. Never point these commands at production during this task. The optional map Prisma schema documents geometry/tsvector as unsupported fields; actual spatial queries use parameterized SQL. App startup does not apply the map chain.

Runtime/worker configuration:

- `JENAN_MAP_STORAGE_ROOT`: absolute private mounted artifact directory, outside `public/`, with restrictive operator permissions. It must be shared by all relevant app/worker instances; ephemeral serverless local disk is **not** durable storage.
- `JENAN_MAP_STAGING_ROOT`: separate absolute private operator staging directory, mode `0700`.
- `JENAN_MAP_BUILD_ACTOR`: authorized existing administrator identity for offline job audit, never accepted from an HTTP import form.
- Runtime enabled/maintenance/disabled state lives in `jenan_map.runtime`; it is not a rebuild-time environment toggle.

The existing document storage interface downloads whole buffers and is unsuitable for multi-gigabyte PMTiles. Map storage therefore uses a separate streaming adapter. An object-storage/CDN adapter is still a deployment integration requirement, not something supplied by setting the old document provider's credentials.

## Truth and safety gates

No licensed Saudi extract, authoritative boundary, published PMTiles archive, production artifact credentials, or verified glyph/sprite build is supplied. Until these exist, show unavailable/no-published-release states. Do not synthesize businesses, addresses, coverage, confidence, health, diff counts, or acceptance metrics. Test geometries are isolated fixtures only.

Publication must require an explicitly approved, validated, immutable release, consistent assets/search/schema and authoritative Saudi coverage, plus explicit administrator confirmation and concurrency protection. Preparation never changes the production pointer. Failed jobs never automatically disable or roll back the map. Previous artifacts are retained; no automatic deletion.

Private staging artifacts and internal layers must not be delivered through published public archives. Export is subject to source licenses, authenticated administration, path/size/checksum checks, streaming, and retention. Export must exclude credentials and unrelated project positions.

## Data preparation and licensing runbook

No real dataset has been imported by this change. Recommended reproducible preparation, performed **outside production**, is:

1. Obtain a dated Saudi `.osm.pbf` extract from a trustworthy distributor such as Geofabrik (`https://download.geofabrik.de/asia/gcc-states.html`; verify the actual available extract and country clipping). Record original URL, download time, source data date, SHA-256, extract scope, ODbL 1.0 and OpenStreetMap attribution. This pointer is not a claim that the source was reachable or downloaded here. Do not scrape tiles or bulk-query public geocoders.
2. Obtain a legally usable authoritative Saudi administrative boundary, including islands, with source/version/date/license. Review validity and coordinate system before import. A rectangle is only a camera constraint, never border authority. Missing boundary blocks selection validation and publication.
3. Pin a reviewed Planetiler/OpenMapTiles-compatible builder release and its checksum, Java runtime, build configuration and source schema. Build locally using the builder's documented country extract workflow. Keep raw sources, processed geometry, logs and temporary outputs outside the Git checkout and separate from the existing application backup-expiry directory. Record the exact command/runtime in the release build evidence. A builder binary is not downloaded or executed by a request handler.
4. Pin tile schema, Arabic/English label fields, min/max zoom, style, sprites, glyphs/fonts and owned search index together. Self-host licensed Arabic-capable fonts (for example Noto under OFL, preserving the original license). Verify Arabic joining, bidi, English fallback and glyph coverage on the **real** archive. Merely installing the application's UI font does not provide map glyph PBFs.
5. Separate public and internal records **before** building artifacts. An internal flag in a frontend layer toggle does not make an otherwise public PMTiles file private. Preserve original source identifiers/provenance in normalized data. Missing businesses are removed-from-source records, not evidence of closure.
6. Validate source license permissions, topology, Saudi coverage, tile/source schema compatibility, exact checksums, search coordinate agreement and genuine comparison evidence. Record unavailable comparison categories as unknown, not zero. Stage and process a new release independently of the production pointer.
7. Review in an authenticated private preview. Only an explicit administrator approval and explicit publication may switch the production release. Do not publish anything as part of developing or testing this branch.

The pipeline reconciles the two requested validation stages: **source validation** precedes normalization; **release validation** follows comparison/build and checks artifacts, geometry, schema and coverage before review/approval. Neither successful upload nor a completed build implies approval.

The offline v1 preparation entry is `node scripts/jenan-map/build.mjs --release <uuid> --manifest <staged-filename.json>`, with explicit private directories and database configuration. It accepts bounded owned GeoJSON and boundary inputs, not arbitrary URLs, shell commands or zip archives. This is **not** a country-scale Planetiler runner or an implemented browser upload/build queue. A normalized GeoJSON artifact alone must never qualify as a production basemap: readiness also requires controlled PMTiles/style artifacts and real schema/coverage acceptance. The 128 MiB/100,000-feature preparation limits are deliberate v1 bounds, not a claim to import an entire Saudi extract through JSON memory.

An operator manifest references existing private local files, not embedded example businesses or geometry:

```json
{
  "countryCode": "SA",
  "authoritative": true,
  "boundaryAuthority": "<reviewed boundary authority>",
  "boundarySource": "<source, version, date and license>",
  "featuresFile": "owned-features.geojson",
  "boundaryFile": "approved-boundary.geojson",
  "confirmation": "BUILD OWNED SA DATA"
}
```

The source release metadata is staged separately through the authenticated administrative create action. The authority assertion must be reviewed against the actual licensed boundary; a string in a manifest is not independent proof of geographical authority.

### Artifact delivery acceptance

Every retained release must carry its version, source data date/license/attribution, schema version, filenames, byte sizes and SHA-256 values. PMTiles files are immutable: replace the release, never overwrite an active archive. Use same-origin artifact URLs to preserve the existing CSP. If a CDN is added, explicitly verify:

- a small `Range: bytes=0-126` request returns `206`, accurate `Content-Range`, `Content-Length` and `Accept-Ranges`;
- unsatisfiable/multiple ranges, aborted streams, inaccessible/missing files and stale validators fail safely;
- authorized staging responses are `private, no-store` and never enter a public cache;
- no public bucket/CDN origin permits bypassing the staging or internal-data authorization;
- cross-origin delivery, if introduced later, has narrow explicit CORS origins and exposes only required range/validator headers; it also needs a separately reviewed scoped CSP change.

These are acceptance requirements, not evidence that a CDN has been configured or tested.

The local adapter checks SHA-256 through the open file descriptor before trusting an artifact. A bounded in-process cache keyed by path/checksum and file device/inode/size/modification/change timestamps avoids hashing the complete archive on every range request. A changed identity requires re-verification. Cold verification can still read an entire large archive once per process; its real latency is **unmeasured**, and a production object-store adapter needs immutable version/checksum guarantees. Do not present this as a completed country-scale performance benchmark.

### Administrative surface and deferred controls

`/admin/jenan-map` has allowlisted child views for versions, updates, sources, layers, storage, health, audit and settings. All admin APIs independently check the session and platform administrator role; state changes also check origin, schema and rate limits. The standalone `/jenan-map` harness is authenticated and does not activate project analysis/start/feasibility integrations.

The implemented HTTP surface includes manifest/search/validation/artifact reads, owned location/preferences, administrator snapshot/actions/private preview/export, the administrator layer catalog, and bounded browser/private-staging artifact import. Automatic scheduling, country-scale tile building, real categorized comparisons, raw bulk bundles and unmeasured health/telemetry controls remain deferred. The layer catalog starts with nullable provenance/confidence and unavailable records. A client toggle is never a permission to expose internal raw data or unpublished files.

### Portability and retention

Export rights depend on each source's license. Individual artifact exports require explicit `exportAllowed` and `exportLicense` evidence; existing artifacts default to no export permission. Raw source artifacts are excluded even when marked exportable. Authorized, release-pinned rendering is distinct from export permission. Portable geometry is a separate licensed GeoJSON artifact when supplied; NDJSON and asynchronous full-bundle export remain unavailable. Do not include application environment files, access tokens or users' project positions.

To move an approved retained release: download its manifest and permitted artifacts, verify every SHA-256 and byte size, copy them into a **new private** storage deployment under immutable keys, stage the same metadata on the destination, revalidate Saudi coverage/search/style/asset URLs and range delivery, then preview and explicitly approve/publish there. Same-origin URLs must resolve through the destination's configured adapter, not a hardcoded provider hostname. Never restore a production pointer by hand or overwrite an existing release. This is a restore procedure requiring acceptance on the destination, not a claim that automated bundle restore exists.

There is **no automatic deletion** of raw sources, prior releases, failed builds or archived releases in v1. Capacity warnings require an operator retention decision consistent with licenses. Do not attach map archive directories to the application's existing expiring PostgreSQL-backup job.

## Verification record

- Baseline `npm ci --ignore-scripts`: succeeded, with a Node engine warning (22 host / 24 required).
- Baseline `npm run lint`: passed.
- Baseline `./node_modules/.bin/vitest run tests/unit`: 76 files passed, 11 files failed to import missing generated Prisma client; 335 tests passed. This was before the map implementation was complete.
- `DATABASE_URL=postgresql://localhost:5432/jenan_map_inspection node_modules/.bin/prisma generate`: succeeded without connecting to a database.
- Initial typecheck overlapped frontend work and reported an as-yet-unwritten map renderer; it is not a clean pre-change typecheck baseline.
- `npm run jenan-map:assets`: succeeded.
- Exact worker copy verified: 508,314 bytes; SHA-256 `5f1e2f0e1624082b7e88a06e4c86085992b0f8c02929801e552f3f7a119856a9`. This is an asset integrity check, not a measured map-load result.
- `node_modules/.bin/eslint playwright.config.ts` and `git diff --check`: passed at configuration integration.
- `npm audit --omit=dev --json`: zero vulnerabilities after adding the map dependencies. Full audit reports five pre-existing high-severity development-tool advisories in the ESLint/Next/glob chain; no unrelated force-upgrade was performed.
- An isolated PostgreSQL 16.15 / PostGIS 3.4 instance was prepared on loopback port 55439 under `/tmp`, without touching the existing application database or volumes. This is test infrastructure, not the repository's PostgreSQL 17 production deployment.
- Parent-owned layer tests: `node_modules/.bin/vitest run tests/unit/jenan-map-layers.test.ts tests/unit/jenan-map-layer-route.test.ts` — **6 passed**. Scoped ESLint passed after correcting one test-variable lint error.
- Parent-owned actual spatial test: `JENAN_MAP_TEST_DATABASE_URL=postgresql://runner@127.0.0.1:55439/jenan_map_test node_modules/.bin/vitest run tests/integration/jenan-map-spatial.integration.test.ts` under Node 24.22.0 — **6 passed**. Tests use connection-local temporary synthetic geometry only, validate meter units at all four radii, polygon-vs-bounding-box coverage, and GiST index eligibility with sequential scanning disabled. They do **not** establish Saudi boundary accuracy or representative production query latency. Scoped ESLint passed.

Pending implementation and exact command results. Real-data renderer acceptance, spatial database integration, range/CDN behavior, responsive viewport matrix, map-load/memory measurements and portable restore must be reported separately from mocked/unit tests. This document must not be read as v1 completion.

## Delivery acceptance checklist — 14 grouped gates

The supplied statement does not enumerate the original fourteen items verbatim. The following groups track its requirements without claiming to reproduce an unavailable checklist.

| # | Gate | Acceptance status |
|---|---|---|
| 1 | Independent branch/routes; preserve projects/home/auth | Implementation under review; production surfaces must remain unchanged |
| 2 | Saudi-only licensed real data and authoritative boundary | **Blocked:** sources not supplied/imported |
| 3 | MapLibre/PMTiles owned basemap and versioned assets | Dependencies and local worker prepared; real archive acceptance **pending** |
| 4 | Arabic premium style, RTL, keyboard and responsive modal | Implemented UI requires browser checks and real-label visual acceptance |
| 5 | Search, click/drag, geolocation, confirmation/cancel and saved location | Implementation/testing in progress; no real-data acceptance |
| 6 | Existing location adapters, no service activation | Adapter only; integration remains intentionally inactive |
| 7 | Geodesic radii and spatial SRID/index/unit correctness | Isolated PostGIS test infrastructure prepared; results pending |
| 8 | Lazy loading, lifecycle disposal and performance evidence | Implementation pending measurement; no real map-load/memory claim |
| 9 | Layer provenance/access control and truthful no-data states | Unsupported analytical layers must remain unavailable |
| 10 | Isolated import/normalize/compare/build/review workflow | Operator preparation only; full country tile build and genuine diffs pending |
| 11 | Approval, atomic publish, explicit rollback and retention | Must pass isolated lifecycle/concurrency tests; no live publication |
| 12 | Admin routes, runtime status, health and audit | Implementation under review; unmeasured health remains unknown |
| 13 | Authorized portable exports, checksums, license and restore | Individual downloads planned; full bundle and destination restore acceptance pending |
| 14 | Lint/types/Prisma/build/unit/E2E, review and handover | Baseline recorded; final results below when available; **v1 not accepted** |

## Continuation from `08d1899` (2026-10-17)

This follow-up preserves the inherited implementation rather than replacing it. It is on the continuation PR based on #24, not a merge into `main`. Data Center, the frozen homepage, Auth UI and Project Analysis are outside the change scope.

### Import and owned assets

`POST /api/admin/jenan-map/releases/<uuid>/artifacts` independently enforces the existing administrator session, origin and rate-limit checks. It accepts:

- Multipart `file` plus JSON `metadata`, bounded to **32 MiB total while reading**.
- JSON `{ "stagedFilename": "<private-local-filename>", "metadata": { ... } }` for streaming a staged artifact of up to **32 GiB**, without buffering the archive. Staging and storage must be separate private directories, outside `public/`. This does not configure persistent hosting storage.

Metadata includes `kind` (`pmtiles`, `style`, `glyphs`, `sprite`, `schema`, `coverage`), logical `filename`, exact `sha256`, exact `byteSize`, `publicSafe`, optional `exportAllowed`/`exportLicense`, and `confirmation: "IMPORT OWNED MAP ARTIFACT"`. Imports retain immutable content-addressed files and audit records; an upload does not approve or publish a release. Sources/geometry still use the offline preparation entry above. No arbitrary URL download, executable builder, archive extraction or remote credentials are accepted by the import handler.

Assets resolve through `/api/jenan-map/releases/<uuid>/<kind>/<filename>`, or its `/api/admin/jenan-map/` private-preview equivalent. The `/assets/<kind>/<filename>` form remains a compatibility alias. Canonical glyph templates are `glyphs/{fontstack}/{range}.pbf`; the sprite base is `sprites/sprite`, with `.json`, `.png`, `@2x.json` and `@2x.png` variants. The same immutable style uses public canonical references; the selected manifest resolves them to authenticated preview endpoints without falling back to the published release.

Approval/publication validates PMTiles v3 structure, root directory and a decoded MVT sample, style/source-layer compatibility, glyph PBFs, sprite image/index bounds, schema evidence and matching boundary provenance. This detects invalid formats; it is **not** exhaustive geographical, Arabic-label or country-scale visual acceptance. A licensed real dataset and human review remain mandatory.

### Account-owned display settings

`GET/PUT /api/jenan-map/preferences` persists radius, visible layer IDs and camera viewport per authenticated **user and release**, with expected-revision conflict detection and audit metadata that excludes camera coordinates. The server rechecks the published pointer and available layers under the runtime lock. Neither the request nor query string can choose another account. The modal restores settings on open, preserves deliberately empty layer selections, and saves them only through **حفظ إعدادات العرض**. Location confirmation is a separate transaction; cancelling a location draft does not save it. Private previews do not write user preferences or locations.

The additive isolated map migration also admits the existing frontend's `geolocation` source in the saved-location database constraint. The sign-in return path now preserves a pinned preview ID. No existing application migration is modified or removed.

The existing global `Permissions-Policy` denied device geolocation. A narrowly scoped header override now permits browser-consented same-origin geolocation on `/jenan-map` only. Home, login, registration and other routes retain the existing denial; camera, microphone and other restrictions are unchanged.

### Real acceptance still blocked

No licensed Saudi PMTiles archive, authoritative boundary with independently reviewed provenance, matching real search dataset, complete Arabic glyph/sprite package or production shared-storage configuration was supplied. Therefore this continuation does not claim a production map, real-data acceptance, reference-fidelity percentage, measured country-scale latency, live publication or completed portable restore. Keep the truthful empty/unavailable states until the operator supplies and reviews those inputs.
