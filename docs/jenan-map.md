# Jenan PRO Map | جنان برو ماب — implementation record

## Architecture inspection (2026-10-17)

This is an independent, **not yet accepted** Saudi-only implementation. It does not replace the existing Leaflet project picker, project geocoder, project analysis, frozen homepage, or authentication. The initial task branch was `copilot/jenan-map-implementation` (PR #24); this open-data continuation builds directly on PR #33 commit `256b58d`. No merge, production migration, dataset publication, live rollback, or deployment is performed by this implementation. Earlier verification records below are historical; the open-data continuation record distinguishes newly downloaded sources from production acceptance.

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

- `JENAN_MAP_STORAGE_ROOT`: absolute private mounted artifact directory, outside `public/`, with restrictive operator permissions. It must be shared by all relevant app/worker instances; ephemeral serverless local disk is **not** durable storage. Not used when the shared object store below is selected.
- `JENAN_MAP_STORAGE_DRIVER=s3` selects the **shared object store** (AWS S3, Cloudflare R2, MinIO, or any S3-compatible service) instead of the filesystem; there is no silent fallback to local disk. It needs `JENAN_MAP_S3_ENDPOINT` (HTTPS; plain HTTP only for a loopback test server), `JENAN_MAP_S3_BUCKET`, `JENAN_MAP_S3_ACCESS_KEY_ID`, `JENAN_MAP_S3_SECRET_ACCESS_KEY`; optional `JENAN_MAP_S3_REGION` (default `auto`, as R2 expects), `JENAN_MAP_S3_PREFIX` (for example `maps/`) and `JENAN_MAP_S3_PATH_STYLE=0` for virtual-hosted-style addressing. Keys and secrets come from deployment secrets only. Uploads are staged in private scratch (`JENAN_MAP_SCRATCH_ROOT`, default the system temp directory) until validated.
- `JENAN_MAP_STAGING_ROOT`: separate absolute private operator staging directory, mode `0700`.
- `JENAN_MAP_BUILD_ACTOR`: authorized existing administrator identity for offline job audit, never accepted from an HTTP import form.
- Runtime enabled/maintenance/disabled state lives in `jenan_map.runtime`; it is not a rebuild-time environment toggle.

The existing document storage interface downloads whole buffers and is unsuitable for multi-gigabyte PMTiles. Map storage therefore uses a separate streaming adapter with two drivers behind one artifact contract: the private filesystem and the S3-compatible object store (`scripts/jenan-map/s3-store.mjs`, AWS Signature V4 over `fetch`, no SDK). The old document provider's credentials are not used.

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

The manifest may also carry an optional `"exportLicense": "<reviewed licence statement>"`. It is an explicit, operator-reviewed decision that the searchable-features artifact (`places.geojson`) may be redistributed under that licence: the builder stores it with the immutable artifact, so the release's portable export manifest can list it. Without it the artifact is retained but cannot be exported, and the private source artifacts (features, boundary and original sources) are never exportable either way. A blank or non-text value is refused before the release is touched.

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

The implemented HTTP surface includes manifest/search/validation/artifact reads, owned location/preferences, administrator snapshot/actions/private preview/export, the administrator layer catalog, the administrator health measurement, and bounded browser/private-staging artifact import. Automatic scheduling, country-scale tile building, real categorized comparisons, raw bulk bundles, and browser, CDN and load telemetry remain deferred (the health section reports only what the server itself can measure; see "Measured health"). The layer catalog starts with nullable provenance/confidence and unavailable records. A client toggle is never a permission to expose internal raw data or unpublished files.

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

This historical baseline predates the continuation results below. Real-data renderer acceptance, spatial database integration, range/CDN behavior, responsive viewport matrix, map-load/memory measurements and portable restore must be reported separately from mocked/unit tests. This document must not be read as v1 completion.

## Delivery acceptance checklist — 14 grouped gates

The supplied statement does not enumerate the original fourteen items verbatim. The following groups track its requirements without claiming to reproduce an unavailable checklist.

| # | Gate | Acceptance status |
|---|---|---|
| 1 | Independent branch/routes; preserve projects/home/auth | Implementation under review; production surfaces must remain unchanged |
| 2 | Saudi-only licensed real data and authoritative boundary | **Blocked:** sources not supplied/imported |
| 3 | MapLibre/PMTiles owned basemap and versioned assets | Validated binary ingestion and release-pinned asset delivery implemented; real archive acceptance **blocked** |
| 4 | Arabic premium style, RTL, keyboard and responsive modal | Empty/unavailable fixture UI passes all ten responsive sizes and keyboard checks; real-label visual acceptance **blocked** |
| 5 | Search, click/drag, geolocation, confirmation/cancel and saved location | Owned persistence, device-source and cancellation fixture checks pass; real-data renderer interaction not accepted |
| 6 | Existing location adapters, no service activation | Adapter only; integration remains intentionally inactive |
| 7 | Geodesic radii and spatial SRID/index/unit correctness | Isolated spatial fixtures passed; authoritative boundary accuracy and production latency remain unaccepted |
| 8 | Lazy loading, lifecycle disposal and performance evidence | Fixture browser checks pass; no real map-load/memory measurement claim |
| 9 | Layer provenance/access control and truthful no-data states | Durable release bindings and selected-layer search implemented; unsupported analytical layers remain unavailable |
| 10 | Isolated import/normalize/compare/build/review workflow | Actual binary/asset ingestion plus offline geometry preparation; full country tile build and genuine diffs remain deferred |
| 11 | Approval, atomic publish, explicit rollback and retention | Nine isolated PostGIS lifecycle tests pass; no live publication |
| 12 | Admin routes, runtime status, health and audit | Implementation under review; unmeasured health remains unknown — **superseded 2026-10-19:** health is now measured server-side (see "Measured health"); browser, CDN and load stay unmeasured |
| 13 | Authorized portable exports, checksums, license and restore | Licensed individual streaming downloads implemented; full bundle and destination restore acceptance remain deferred |
| 14 | Lint/types/Prisma/build/unit/E2E, review and handover | Local checks pass as recorded below; CodeQL and real-data acceptance blocked; **v1 not accepted** |

## Continuation from `08d1899` (2026-10-17)

This follow-up preserves the inherited implementation rather than replacing it. It is on the continuation PR based on #24, not a merge into `main`. Data Center, the frozen homepage, Auth UI and Project Analysis are outside the change scope.

### Import and owned assets

`POST /api/admin/jenan-map/releases/<uuid>/artifacts` independently enforces the existing administrator session, origin and rate-limit checks. It accepts:

- Multipart `file` plus JSON `metadata`, bounded to **32 MiB total while reading**.
- JSON `{ "stagedFilename": "<private-local-filename>", "metadata": { ... } }`, with a **16 KiB request limit**, for streaming a staged artifact of up to **32 GiB**, without buffering the archive. Staging and storage must be separate private directories, outside `public/`. This does not configure persistent hosting storage.

Metadata includes `kind` (`pmtiles`, `style`, `glyphs`, `sprite`, `schema`, `coverage`), logical `filename`, exact `sha256`, exact `byteSize`, `publicSafe`, optional `exportAllowed`/`exportLicense`, and `confirmation: "IMPORT OWNED MAP ARTIFACT"`. Imports retain immutable content-addressed files and audit records; an upload does not approve or publish a release. Sources/geometry still use the offline preparation entry above. No arbitrary URL download, executable builder, archive extraction or remote credentials are accepted by the import handler.

Assets resolve through `/api/jenan-map/releases/<uuid>/<kind>/<filename>`, or its `/api/admin/jenan-map/` private-preview equivalent. The `/assets/<kind>/<filename>` form remains a compatibility alias. Canonical glyph templates are `glyphs/{fontstack}/{range}.pbf`; the sprite base is `sprites/sprite`, with `.json`, `.png`, `@2x.json` and `@2x.png` variants. The same immutable style uses public canonical references; the selected manifest resolves them to authenticated preview endpoints without falling back to the published release.

Approval/publication validates PMTiles v3 structure, root directory and a decoded MVT sample, style/source-layer compatibility, glyph PBFs, sprite image/index bounds, schema evidence and matching boundary provenance. This detects invalid formats; it is **not** exhaustive geographical, Arabic-label or country-scale visual acceptance. A licensed real dataset and human review remain mandatory.

### Release-scoped layer binding

After importing the actual style, `POST /api/admin/jenan-map/releases/<uuid>/layers` accepts `{ layers: [{ id, styleLayerIds, searchCategories, visibility: "public", confidence }], confirmation: "BIND MAP LAYERS" }`. The admin form is enabled only when storage and the server's `layer-bind` capability are available. Every actual style layer, including background, must be bound; internal or unbound style layers are rejected. Browser imports require an unreviewed Draft/Ready candidate and never publish it.

Bindings retain immutable provenance. Per-release enabled/revision updates affect the manifest, rendering and `layerIds`-filtered search together; unavailable bindings remain explicitly unavailable rather than silently enabled. The additive candidate-binding guard retains archived bindings and refuses new bindings for approved, published or archived releases. Existing committed migrations are unchanged.

### Account-owned display settings

`GET/PUT /api/jenan-map/preferences` persists radius, visible layer IDs and camera viewport per authenticated **user and release**, with expected-revision conflict detection and audit metadata that excludes camera coordinates. The server rechecks the published pointer and available layers under the runtime lock. Neither the request nor query string can choose another account. The modal restores settings on open, preserves deliberately empty layer selections, and saves them only through **حفظ إعدادات العرض**. Location confirmation is a separate transaction; cancelling a location draft does not save it. Private previews do not write user preferences or locations.

The additive isolated map migration also admits the existing frontend's `geolocation` source in the saved-location database constraint. The sign-in return path now preserves a pinned preview ID. No existing application migration is modified or removed.

The existing global `Permissions-Policy` denied device geolocation. A narrowly scoped header override now permits browser-consented same-origin geolocation on `/jenan-map` only. Home, login, registration and other routes retain the existing denial; camera, microphone and other restrictions are unchanged.

### Real acceptance still blocked

No licensed Saudi PMTiles archive, authoritative boundary with independently reviewed provenance, matching real search dataset, complete Arabic glyph/sprite package or production shared-storage configuration was supplied. Therefore this continuation does not claim a production map, real-data acceptance, reference-fidelity percentage, measured country-scale latency, live publication or completed portable restore. Keep the truthful empty/unavailable states until the operator supplies and reviews those inputs.

### Continuation verification record

- Locked dependency install and Prisma client generation succeeded. The available host is Node 22.23.3, while the project requests Node 24; this warning is not suppressed.
- Parent-owned unit checks: `node_modules/.bin/vitest run tests/unit/jenan-map-ui.test.ts tests/unit/jenan-map-preferences.test.ts` — **63 passed** after final search-contract changes. Scoped ESLint passed.
- Browser matrix: `playwright test tests/e2e/jenan-map.spec.ts --project=jenan-map --retries=0` — **28 passed** across the ten specified sizes, including keyboard focus, truthful empty states, no engine/data initialization on public pages, preview-preserving sign-in, saved settings, device location, and cancellation. After adding selected-layer search, the targeted search/ordinary-member checks both passed. These mocked transport/fixture tests are not real-dataset acceptance.
- Browser-test instrumentation distinguishes Turbopack's tiny async-import loader stub from the actual map engine, and accommodates React Strict Mode's replayed effect while checking that closing does not generate new requests.
- A fresh isolated loopback PostGIS development database received the ordinary app and opt-in map migrations. No production database was connected, reset or published.
- Backend focused checks: **79 unit tests and 9 actual PostGIS lifecycle tests passed**. Layer/admin checks: **50 unit/frontend tests and 5 real PostgreSQL binding persistence/guard tests passed**. These focused counts overlap the full suite and must not be summed as distinct tests.
- Final full `node_modules/.bin/vitest run`: **785 passed, 23 skipped** (151 files passed, 6 skipped). Existing opt-in database tests were also exercised separately above. The existing Academy foundation seeder was required for the full-suite database fixture; no unrelated tests were weakened. Sixteen `pg` concurrent-query deprecation warnings remain visible.
- Final `npm run lint`, `npm run typecheck` and `npm run build`: **passed**. ESLint excludes only the generated, dependency-copied MapLibre worker; application lint rules are unchanged. Build generated all 154 static pages.
- Read-only review identified a candidate-binding trigger/API mismatch and omitted export-license metadata. Both were fixed; two focused regressions passed, including an actual SQL migration check after additive-migration consolidation.
- The disposable database's pre-applied map SQL was baselined into its migration journal without dropping data; the final `prisma migrate deploy --config prisma.jenan-map.config.ts` reports no pending migrations. Do not copy this test-fixture baselining step to an unverified production database.
- Secret scanning reported no secrets in changed files before commit `a20f73c`. The commit was pushed to the continuation branch; no merge into `main` occurred.
- Automated Code Review/CodeQL invocation ended with a **validation time-limit response before results**. This is not a clean scan; security-scan completion remains an explicit delivery blocker.
- GitHub Actions CodeQL and continuous-verification runs currently report `action_required` with no executed jobs; the retrieved CodeQL logs contain no failed jobs or scan result. Maintainer approval/execution and a successful CodeQL result are still required.

## Open-data continuation — source verification (2026-10-17)

Open boundaries are **unofficial**, not authoritative Saudi government boundaries. A reviewed country polygon can constrain this independent map's picker without establishing legal jurisdiction, cadastral accuracy, or official coverage. The older runbook's demand for an official source must not be satisfied by falsely labelling geoBoundaries or OSM as government data.

The following real source files were downloaded outside the checkout to `/tmp/jenan-map-open-sources/`, from geoBoundaries repository revision `9469f09592ced973a3448cf66b6100b741b64c0d`. No country binaries or full source datasets are committed. Download is not import, review, approval, or publication.

| Layer | Source / organization | Source date and limitations | Actual source license / attribution |
|---|---|---|---|
| Country (ADM0, 1 unit) | geoBoundaries / William & Mary geoLab; upstream OpenStreetMap, Wambacher | Boundary year **2017**; metadata update 2023-01-19, build 2023-12-12; downloaded 2026-10-17 | **ODbL 1.0**; © OpenStreetMap contributors; geoBoundaries / William & Mary geoLab; Wambacher |
| Regions (ADM1, 13 units) | geoBoundaries / William & Mary geoLab; upstream OpenStreetMap, Wambacher | Boundary year **2017**; metadata update 2023-01-19, build 2023-12-12; downloaded 2026-10-17 | **ODbL 1.0**; © OpenStreetMap contributors; geoBoundaries / William & Mary geoLab; Wambacher |
| Governorates (ADM2, 147 units) | geoBoundaries / William & Mary geoLab; upstream geoBoundaries, OpenStreetMap | Boundary year **2021**; metadata update 2023-01-19, build 2023-12-12; downloaded 2026-10-17 | **CC-BY-SA 2.0**, as stated by this file's metadata; retain attribution, license and modification notice, and review upstream mixed-license obligations before redistribution |
| Roads, places and POIs | OpenStreetMap contributors, distributed by Geofabrik | GCC extract must be clipped to the reviewed Saudi polygon. No extract was downloaded in this session; source timestamp remains unavailable until supplied | **ODbL 1.0**; © OpenStreetMap contributors, https://www.openstreetmap.org/copyright; distributor https://download.geofabrik.de/asia/gcc-states.html |

Do **not** assume every `gbOpen` file is CC-BY 4.0. The Saudi metadata explicitly reports the licenses above. The metadata's update/build dates are not fresh survey dates; preserve the older boundary year too. These sources contain English administrative names; Arabic aliases must come from actual source tags, not invented translations. Natural Earth was not used.

The adjacent `CITATION-AND-USE-geoBoundaries.txt` additionally identifies geoBoundaries code/derivative works as CC-BY 4.0 and requires a [geoBoundaries](https://www.geoboundaries.org) attribution link **alongside** the individual file's upstream citations. Preserve both product and upstream notices; the product citation does not replace the source license. Academic citation: Runfola et al. (2020), *geoBoundaries: A global database of political administrative boundaries*, https://doi.org/10.1371/journal.pone.0231866.

For each level `ADM0`, `ADM1`, `ADM2`, the source URL is:

```text
https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09592ced973a3448cf66b6100b741b64c0d/releaseData/gbOpen/SAU/<LEVEL>/geoBoundaries-SAU-<LEVEL>_simplified.geojson
```

The adjacent `geoBoundaries-SAU-<LEVEL>-metaData.json` records upstream licensing and dates. The `raw.githubusercontent.com` equivalent contains a **Git LFS pointer**, not geometry; never import it as GeoJSON. Simplification is an upstream modification; country/region edge agreement and islands still require geometry review.

Direct PostGIS inspection of these downloaded sources found valid country geometry, 13 valid region geometries and 147 valid governorate geometries. However, exact `ST_Covers` against the simplified ADM0 polygon covered only **4/13 regions** and **101/147 governorates**. Independent simplification and source vintage cause edge mismatches; a successful download is not spatial consistency. Do not bypass coverage validation or call the remaining features missing territories. Any operator clipping must retain original source identifiers, record the transformation and be reviewed for coastal/island loss before publication.

Verified SHA-256 of downloaded simplified geometry:

```text
ADM0 7908e4f59ae61e5a8a39b1d0e4cea12d576b0a0b8fcee3daf6de80447a8a012d
ADM1 cf50a59ddcda0fc4539c12799c320b9936fd75f47c1b5562ef548436d9169e13
ADM2 1a336a495dfcf3c369c5b5d05c205d7509610e0ab27ef1539140f8a8c763e335
```

### Network and firewall evidence

Direct DNS/download attempts failed for `www.geoboundaries.org` and `download.geofabrik.de`; license-document requests also failed for `www.openstreetmap.org` and `www.naturalearthdata.com`. Both `raw.githubusercontent.com` and `media.githubusercontent.com` were reachable, allowing the pinned boundary downloads above. No replacement OSM records or fabricated source dates were created.

Allow these exact hosts for the operator workflow as applicable:

- `www.geoboundaries.org`: current API discovery (not required by the pinned mirror).
- `media.githubusercontent.com`: actual pinned geoBoundaries LFS source files.
- `raw.githubusercontent.com`: repository metadata/LFS pointers; not a substitute for LFS content.
- `download.geofabrik.de`: GCC PBF extract, timestamp/checksum and distributor page.
- `www.openstreetmap.org`, `opendatacommons.org`, `creativecommons.org`: attribution and license documents.

The production browser does not need these hosts: it must keep using the existing same-origin artifact endpoints. Do not widen the application CSP to solve an offline importer download problem. Any newly encountered redirect host must be reviewed and recorded rather than silently allowing arbitrary hosts.

### Production shared storage requirements

Keep the existing streaming artifact adapter and immutable `<release UUID>/<SHA-256>.<extension>` keys. `JENAN_MAP_STORAGE_ROOT` must be a durable, private **shared mount** visible at the configured absolute path to every serving app and importing worker; single-instance ephemeral disk is insufficient. Staging is a separate private `JENAN_MAP_STAGING_ROOT`. Both roots require mode `0700`; imported files are read-only `0400`, so deploy processes need a compatible service identity. Never place either root under `public/`, in git, or in the application's expiring database-backup directory.

Provision enough capacity for raw GCC input, country-clipping/build intermediates, the candidate release and all retained published/rollback artifacts. Back up immutable artifacts plus release metadata together; prove restore and range streaming on the destination before switching traffic. No retention deletion is automated.

The shared object store (`JENAN_MAP_STORAGE_DRIVER=s3`) is the preferred production adapter: it implements the same authorization, immutable-key, checksum, range and abort semantics, with private preview isolation unchanged (the browser still only talks to the same-origin artifact endpoints; the bucket is never public and holds only content-addressed objects). Credentials are configured only through deployment secrets; there are no embedded production credentials and no configured production bucket or mount in this change. See "Shared object storage" in the continuation section below for exactly what was and was not verified.

### Reproducible operator commands

Run from the repository root with Node 24, in an operator-controlled development environment. Use **new**, absolute private directories outside the checkout; acquisition/preparation refuse overwriting prior evidence. Install reviewed versions of `osmium`, GDAL `ogr2ogr`, and `tippecanoe` separately. The CLI records tool versions, commands, checksums and transformations; it never installs or executes a downloaded binary.

```sh
# Working pinned mirror: downloads actual ADM0/1/2 and retains individual licenses.
node scripts/jenan-map/prepare-open-data.mjs acquire-pinned-boundaries /srv/jenan-map/acquisition-boundaries-01

# With API/Geofabrik access and osmium installed: acquire boundaries and real GCC PBF.
node scripts/jenan-map/prepare-open-data.mjs acquire /srv/jenan-map/acquisition-full-01

# Create a Draft release in /admin/jenan-map first; substitute its actual UUID.
node scripts/jenan-map/prepare-open-data.mjs prepare /srv/jenan-map/prepared-01 /srv/jenan-map/acquisition-full-01/sources.json <draft-release-uuid>
```

Pinned-only acquisition writes `boundary-sources.json` with `osm: null`, not a publishable release. If using this mode, obtain the GCC PBF separately, retain its SHA-256 and **actual PBF replication timestamp**, and supply an operator-reviewed `sources.json`: the same `boundaries` array plus `osm: { file, sha256, provenance }`. `file` is absolute; provenance has `source`, `organization`, HTTPS `url`, ISO `sourceDate` and `importedAt`, `license: "ODbL-1.0"` and required attribution. Never substitute the download date or replication-state retrieval time for the PBF's actual source timestamp. `prepare` deliberately fails without real OSM input.

Preparation clips actual geometries to ADM0, keeps original administrative sources private, retains upstream IDs and source-provided bilingual aliases, and emits `features.geojson`, `boundary.geojson`, `saudi.pmtiles`, `style.json`, `schema.json`, `bindings.json` and checksummed `prepared-artifacts.json`. Named roads participate in bounded search; unnamed roads render without fabricated labels. More than 100,000 searchable features or 128 MiB of search geometry is a **hard blocker**, not permission to silently truncate a Saudi dataset.

Review `coverage-review-required.json` and `import-review-required.json` against the original sources and the clipping evidence. Only after actual review, create `coverage.json` and `import.json` with `coverageVerified: true`; retain `authoritative: false`, `unofficial: true`, the exact notice, country SHA-256 and per-layer provenance. Do not merely flip an attestation to bypass a failed validation. Install the **additive opt-in map migration** using the isolated map Prisma config, not the ordinary application migration chain.

```sh
# Environment comes from operator configuration, never committed credentials.
# Roots must be separate, private 0700 directories; prepared files go in staging.
JENAN_MAP_STAGING_ROOT=/srv/jenan-map/prepared-01 \
JENAN_MAP_STORAGE_ROOT=/srv/jenan-map/artifacts \
node scripts/jenan-map/build.mjs --release <draft-release-uuid> --manifest import.json
```

`DATABASE_URL` and `JENAN_MAP_BUILD_ACTOR` must already identify the reviewed development database and an active platform administrator. The importer validates original source hashes, records explicit administrative intersection transformations and immutable coverage/provenance, then advances **Draft → Processing → Ready** only. It does not publish.

Import generated PMTiles/style/schema and reviewed coverage using the existing authenticated artifact form/API with exact byte sizes and SHA-256 values. Import licensed Arabic/Latin glyph PBFs matching the generated style's `Noto Sans Arabic` font stack, retaining their OFL notice; this repository does not supply a complete glyph package. Import `bindings.json` through the existing layer binding action. Its source, organization, URL, dates, license and attribution are preserved per layer and exposed in the admin catalog. Public rendering includes visible OpenStreetMap attribution and the unofficial-boundary notice. Existing layer toggles, selected-layer search, picker validation, private preview, explicit approval/publication and concurrency-protected rollback remain in use.

Review the candidate in private preview, then use the existing explicit **approve**, **publish**, and retained-release **rollback** actions. There is no direct SQL production-pointer switch or automatic publication command. Do not approve a fixture archive or missing glyph package as real Saudi acceptance.

### Open-data verification and remaining gates

- Continuation implementation checks: **797 full-suite tests passed, 24 skipped**; **124 targeted Node 24 tests passed**, including **22 opt-in PostGIS checks**. These counts overlap. Lint, typecheck, Prisma validation and build passed; build generated 154 static pages. The full-suite/build run used available Node 22; the targeted run used Node 24.21.0, so a complete Node 24 deployment-gate rerun remains unverified.
- Real-source integration exercised the actual country polygon, source-derived administrative geometry, immutable per-layer licensing, Arabic/English source-name indexing, administrative clipping with original-source retention, and refusal to approve incomplete artifacts. Existing isolated publish/rollback mechanics also passed. Small test excerpts are not production data; test-only assets do not establish real PMTiles or Arabic visual acceptance.
- Pinned boundary acquisition actually succeeded. OSM acquisition and country-scale conversion were **not** executed successfully here: Geofabrik DNS is blocked, and the required external conversion tools are not installed. Keep published-map unavailable states until the operator completes the genuine dataset and approval workflow.
- No production migration, live publication, live rollback, production storage configuration, or main merge occurred. Official licensed Saudi data, fresh/verified coverage, full Arabic glyph acceptance, country-scale performance, responsive real-map review and production restore remain separate acceptance gaps.
- Production dependency audit reported zero known vulnerabilities; the complete dependency audit retains five pre-existing development-tool high-severity advisories. No force-upgrade or warning suppression was applied.
- The implementation agent reported a CodeQL scan with zero alerts, but automated code review was unavailable in its environment. Parent validation results and any maintainer-required GitHub workflow approval are recorded separately; a local scan does not replace an approved required GitHub check.

## Real Saudi acceptance, restore and operations (2026-10-18, branch `jenan-map/integration`)

This section supersedes the earlier "Real acceptance still blocked" notes for the items it covers; the earlier records stay as history.

### What was run, on real data

- **Sources:** the OpenStreetMap-derived Protomaps Saudi PMTiles builds (z12 ≈ 115 MB and z15 ≈ 975 MB, pinned by SHA-256 in their `.manifest.json`), the pinned geoBoundaries ADM0/ADM1/ADM2 polygons, and Noto Sans glyph ranges (OFL-1.1). Nothing is synthetic.
- **Preparation:** `node scripts/jenan-map/prepare-saudi-import.mjs --pmtiles <archive> --boundaries <dir> --out <new dir>` reads the searchable features out of the real archive, drops points outside the country polygon (never moves them) and writes `features.geojson`, `boundary.geojson`, the three original sources, `import.json` and `bindings.json`. The z15 archive gives **55,081 features** (16,010 places, 35,028 roads, 3,883 POIs, 13 regions, 147 governorates); 43,552 points were outside Saudi Arabia and were dropped.
- **Acceptance suite:** `tests/integration/jenan-map-acceptance.integration.test.ts`, opt-in (`RUN_JENAN_MAP_ACCEPTANCE=1`, `JENAN_MAP_ACCEPTANCE_STAGE=<prepared folder>`) and only against a disposable loopback `jenan_map_test` PostGIS database. It runs on the private filesystem, or against an S3-compatible store when `JENAN_MAP_STORAGE_DRIVER=s3` and the `JENAN_MAP_S3_*` settings are present (it then also asserts that no artifact reaches local disk). **10 of 10 scenarios passed in both modes** on 2026-10-18 (filesystem in 5 minutes; S3 against a local Scality CloudServer in 18 minutes, a slow reference server on a loaded machine):
  1. import version A (z12) → validate → approve → publish; 2. Arabic and English search for a city, district, street and POI; 3. location validation (inside accepted, outside Saudi Arabia refused); 4. save a location with its real region/city/district/address, close and reopen it; 5. 500 m / 1 km / 3 km / 5 km radii in PostGIS metres; 6. **export a real layer as GeoJSON, CSV and GeoPackage with the same features, the same geometry bytes PostGIS produces, and the same source, licence and attribution in each (a header block in GeoJSON and GeoPackage, columns on every CSV row)**; 7. preview version B (z15) without touching customers, then publish it atomically; 8. roll back to A with both versions and the audit trail kept; 9. **back up A, validate the backup, restore it as a new candidate, preview and approve it while production stays untouched**; 10. maintenance and disabled are explicit, separate states.
  The first S3-mode run passed 6 of 9 and the second 7 of 9. The failures were real: approval hashed a 975 MB archive inside a 60 s transaction, a restore statement exceeded the database query timeout, and one test's default 20 s timeout was too short for slow storage. All three are fixed (below) and the suite was re-run in both modes.
- **Not measured:** a browser run of the restored/published map, country-scale latency under load, memory under load, and anything on a live Cloudflare R2 or AWS S3 endpoint or a CDN. Passing this suite is service-level acceptance on real data, not a performance or visual-fidelity claim.

### Defects the real run exposed (fixed, each with a regression test)

- **Arabic labels:** the Arabic style drew water labels in *Noto Sans Italic*, which has no Arabic glyphs (four 26–28-byte empty ranges), so those names would have rendered blank. The style no longer uses Italic (`STYLE_FONTS` is Regular and Medium) and the glyph script no longer downloads it.
- **Glyph validation:** an empty glyph range is valid protocol (a font simply has none there) and is now accepted per file. Coverage is decided per release instead: `labelFontGaps` makes approval fail unless every font a label layer uses has glyphs in the Latin (0-255) and Arabic (1536-1791) blocks.
- **Layer provenance contract:** open (unofficial) coverage must list the reviewed provenance of every dataset the release holds, namely each public layer binding and each imported feature layer, and nothing else (`layerProvenanceProblems`). A bound layer is searchable by its own category exactly when the release has features of that category (tile-only layers such as the base map are not). The previous rule required bindings and coverage to match one to one with at most five entries, which made a real six-layer release impossible to approve. `COVERAGE_LAYER_IDS` lists the allowed datasets. Water and land use belong to the `base` binding, so `styleLayerGroups` claims every style layer once. **Governorates** are administrative data without a style layer: they stay in the release (they fill the city of a saved location) and carry their own reviewed provenance, but are not a search layer in v1.
- **Clipping tolerance:** `ST_Intersection` rounds the vertices it creates, so a polygon clipped to the country can lie millimetres outside the boundary it was cut with. Clipped region and governorate polygons are accepted within `CLIP_TOLERANCE_DEGREES` (about 11 cm, shared by the builder and the restore); every other feature must be exactly inside. Search asks that a feature's representative point is inside the country, so these polygons are no longer silently dropped from results (about a third of them were).
- `prepare-saudi-import.mjs` did nothing on a path containing spaces or non-ASCII characters (its "run as a script" check compared a percent-encoded URL); it now uses `fileURLToPath`.

### Backup and restore

- **Create Full Map Backup** (`POST /api/admin/jenan-map/backup`, action `create`, confirmation `CREATE FULL BACKUP`, administrator + origin check) writes a new folder under `JENAN_MAP_BACKUP_ROOT` (absolute, private, outside `public/` and outside the map storage). It holds every artifact of the release by checksum (PMTiles, style, glyphs, sprites, schema, coverage, searchable features, boundary and the original sources), the layer configuration (style layers, search categories, confidence, provenance), the source registry with ownership classes, and a deterministic manifest with its own digest. Identical bytes are stored once. Because it contains private source evidence, a backup is not an export and must be stored privately.
- **Validate** (`action: validate`) re-reads every file and checks the manifest digest, sizes, checksums, extra files and the required kinds. It changes nothing.
- **Staging.** A backup is written into a staging folder of its own (`<folder>.<12 hex digits>.partial`) that only the request which created it fills, verifies or removes, and it is renamed to the final name only after every file has been checked. The folder name resolves seconds, so two requests for the same release in the same second ask for the same name; they cannot touch each other's work: the first to finish keeps the name, and the other is refused with `BACKUP_FOLDER_EXISTS` (409) after removing only its own staging folder. Staging folders end in `.partial`, so they are never listed, validated or restored. A server that dies half way leaves its staging folder behind; it is inert and safe to delete by hand.
- **Restore** (`action: restore`, confirmation `RESTORE AS NEW CANDIDATE`) turns a *valid* backup into a **new unreviewed candidate**: a new Draft release moves to Processing, the boundary and features are inserted set-based (every feature must still be inside the restored boundary), the private sources are retained, the remaining artifacts go through the same validated import path as an administrator upload (the style is rewritten so every asset URL names the new release), layer bindings are recreated, and the release ends **Ready**. It never touches the published release or the runtime pointer, and a failure marks the new release Failed. The candidate then follows the normal Preview → Approve → Publish path, each step with its own explicit confirmation. Restore is not available for a backup that lacks the searchable features, the boundary source or the coverage evidence.
- The admin section **التصدير والنسخ الاحتياطي** (`/admin/jenan-map/backup`) lists backups, creates and validates them, and restores a validated one. It states when the backup folder is not configured instead of failing. It also holds the layer data export described below.

### Admin overview

The overview shows only measured values: runtime status, published version, last release update, last publish or rollback (from the audit log), the stored size of the published PMTiles archive, the number of datasets and active layers of the published release, and PostGIS (asked for its version), plus storage status. CDN is shown as not measured because nothing in the platform measures it. Anything that cannot be read shows "unknown", never zero or healthy.

### Shared object storage (S3-compatible), 2026-10-18

`JENAN_MAP_STORAGE_DRIVER=s3` (see the configuration list above) stores every artifact in an S3-compatible bucket under the same immutable key (`<release UUID>/<SHA-256>.<extension>`), with no filesystem copy and no dependence on the machine of an agent or worker.

- **Write path:** an upload is staged in private scratch, its SHA-256 and size are checked, its format is validated, and only then is it put under its immutable key with the payload hash signed (`x-amz-content-sha256`), the checksum recorded as object metadata and `If-None-Match: *` so an existing object is never replaced. A repeat of the same upload is "exists"; different bytes under the same key are a conflict. The object is written before the database transaction (a large archive would outlast it), so a failed transaction leaves only an immutable, retained object. A single PUT is limited to 5 GiB; multipart upload is not implemented, so a larger artifact is refused rather than truncated.
- **Read path:** reads are ranged requests (PMTiles clients ask for byte ranges); an aborted browser request aborts the upstream request. Opening an artifact compares its size and recorded checksum with the database (one cached HEAD). Approval, publication, rollback, enabling and backup force a full read-and-hash of every object, coalesced across concurrent callers; a store that returns no checksum metadata is hashed once instead.
- **Safety:** HTTPS is required (plain HTTP only for a loopback test server), redirects are never followed (a redirect would replay a signed request elsewhere), no secret or store detail reaches a response (failures surface as `OBJECT_STORE_UNAVAILABLE` / `ARTIFACT_INTEGRITY_FAILED`), and a broken configuration is a 503, never a silent fallback to local disk. The storage panel measures the store by listing the bucket with the configured credentials.
- **Still local by design:** backups (`JENAN_MAP_BACKUP_ROOT`) stay a private local folder, and the offline builder reads its staging folder locally; both write their artifacts to the shared store when it is selected.
- **Verified:** AWS Signature V4 reproduces the published AWS test vectors and an independent Python implementation; 32 unit tests cover signing, configuration, upload/read/range/abort, conflicts, integrity failures and store outages against a fake server that re-derives every signature. Against a **real S3 implementation** (Scality CloudServer, run in Docker on loopback) 19 of 19 live checks passed (bucket creation and listing, 30 MiB streaming upload, exact ranged reads, conflict, refusal of a wrong secret, aborted reads), and the real Saudi acceptance suite passed 10 of 10 with the store selected (see "What was run, on real data" above). CloudServer accepts a wrong payload hash on PUT, so integrity on this store rests on the full read-and-hash at approval, which is how the adapter is designed.
- **Not verified:** a live Cloudflare R2, AWS S3 or CDN endpoint, multi-gigabyte objects, and production-region latency. Credentials for those were not available and were not requested.

### Verification before the transaction, and batched writes

The S3 acceptance run exposed three scale defects that the local filesystem had hidden; each is fixed with a regression test.

- **Approval no longer hashes inside a transaction.** Approving, publishing, rolling back and enabling the map each verify every stored artifact in full, and that used to happen inside a 60 s serializable transaction: reading the 975 MB archive from shared storage took 178 s, so the transaction expired. `preverifyCommand` now does this before the transaction opens (the admin route calls it), and the transaction only checks that the release still holds exactly what was verified (a fingerprint of the artifacts and the boundary evidence); if anything differs it verifies again inside, as before.
- **Restore inserts in batches.** The restored features went in one statement that exceeded the database query timeout (30 s) on a loaded machine. They are now inserted 5,000 at a time (administrative polygons 10 at a time) against a boundary prepared once per transaction.
- **The offline builder inserts in batches.** One statement per feature rebuilt PostGIS's prepared form of the country boundary every time. A full Saudi build (55,081 features) takes **95 s instead of about 9-10 minutes**, and the stored result is identical to the per-feature build layer by layer (counts and a digest of label, source id, category, aliases and geometry) and the `places.geojson` artifact has the same SHA-256.

### Export formats and the PostGIS dump

- **Layer data export** (`GET /api/admin/jenan-map/releases/<id>/layers/export?layerId=...&format=geojson|json|csv|gpkg`) now includes **GeoPackage 1.3** (`services/jenan-map/geopackage.ts`, built with Node's built-in `node:sqlite`): WGS 84 geometry as GeoPackageBinary with an envelope, the attributes, extents, and the layer's licence, ownership class, attribution and source both in the layer description and as `gpkg_metadata`. Only layers bound to the release whose recorded licence allows redistribution can be exported (`EXPORT_LICENSE_PERMISSION_REQUIRED` otherwise), a layer above 100,000 features is refused whole, and every export is audited. It was read back by **GDAL 3.12.4**, an independent implementation, on the real Saudi layers: 16,010 places, 35,028 roads and 13 regions, EPSG:4326, all geometries valid, Arabic labels intact, counts equal to PostGIS.
- The admin section **التصدير والنسخ الاحتياطي** (`/admin/jenan-map/backup`) lists the published release's layers that hold data, with a download link per format where the licence allows it and the reason where it does not.
- **Provenance in every format.** The release, source, licence, ownership class, attribution and export time are stated once in the header of GeoJSON (`properties`), JSON (top-level fields) and GeoPackage (layer description and `gpkg_metadata`), and travel as **columns on every row of the CSV** (`release_id`, `provenance_source`, `provenance_license`, `provenance_ownership`, `provenance_attribution`, `generated_at`), because a CSV has no header block and a row that is copied or filtered must keep them. A unit test holds the CSV columns to the metadata fields of the other formats, so a field added to one has to reach the other, and the download route is tested end to end. Until the final review of 2026-10-19 the CSV carried none of this, although this document and the administration screen said every file did; that was a defect and it is fixed. An empty layer downloads as a header-only file.
- **PostGIS dump** (`node scripts/jenan-map/dump-postgis.mjs`, an operator tool needing `pg_dump` and `pg_restore`; `DATABASE_URL` and `JENAN_MAP_BACKUP_ROOT`): dumps the `jenan_map` schema in custom format into the private backup folder, passing credentials through the environment and never the command line, verifies the dump by listing it with `pg_restore`, and writes a manifest with its SHA-256. It never restores. The artifact bytes are in the full backup or the shared store, not in the database. To restore, create a scratch database with the `postgis` extension and run `pg_restore --no-owner --exit-on-error --dbname <scratch> <file>`, then review before anything else. Verified with real `pg_dump` 17.5: a 147 MB dump of 771,158 features restored into a scratch database with identical row counts (releases, features, artifacts, audit).
- The full backup (above) remains the complete portable form: PMTiles, style, glyphs, sprites, features, boundary, sources, layer configuration and provenance.

### Browser acceptance on real data (2026-10-19)

The service-level acceptance above proves the data and the services. This proves what a person sees: it drives the real application in a real browser (Playwright, Chromium) against the real Saudi z15 PMTiles, the real glyphs, the real PostGIS features, real sessions and the real screens. It is **opt-in** and not part of CI: it needs about 4 GB of provisioned data and a server started against it.

1. **Provision once** (a disposable loopback database named `jenan_map_e2e` or `jenan_map_test` with the application and map migrations applied, the prepared stage folder from the section above, and a new empty absolute folder). It builds two real releases through the same offline builder and ingestion path an operator uses, leaves **release A (z15, Light) Published** with the runtime enabled and **release B (z15, Dark) Ready**, and writes `state.json` (244 s on the reference machine):

   ```sh
   RUN_JENAN_MAP_PROVISION=1 DATABASE_URL=postgresql://.../jenan_map_e2e JENAN_MAP_LOCAL_RUN=<new empty folder> JENAN_MAP_ACCEPTANCE_STAGE=<prepared folder> node ./node_modules/vitest/vitest.mjs run tests/integration/jenan-map-provision-local.integration.test.ts
   ```

2. **Serve it:** `next dev` (or `next start`) with that `DATABASE_URL`, `JENAN_MAP_STORAGE_ROOT=<folder>/storage`, `JENAN_MAP_BACKUP_ROOT=<folder>/backups` and `NEXT_PUBLIC_APP_URL=<the server's origin>`. A development server that has compiled the administration pages needs `NODE_OPTIONS=--max-old-space-size=2560` (it ran out of a 1.5 GB heap during a restore) and a machine with comfortably more than 8 GB; run the browser and the server alone on it. **If the development server ever dies, delete `.next/dev` before starting it again:** a Turbopack cache left behind by a crash made every page reload in a loop (132 reloads in two minutes) until it was removed. A production server (`npm run build`, then `next start`) additionally needs `REDIS_URL` (production rate limits fail closed without Redis) and either the private gate or `PUBLIC_LAUNCH=approved`; see "The same acceptance on a production build" below.
3. **Run** the member spec, then the administration spec (which approves, publishes, rolls back, backs up and restores inside that environment and ends with release A published again). Screenshots and measured traffic are written to `<folder>/evidence/`. Each spec compiles every route it will open before the browser starts: a development server compiles a route on its first request, and on a small machine that competes with the browser for memory.

   ```sh
   RUN_JENAN_MAP_REAL_E2E=1 JENAN_MAP_LOCAL_RUN=<folder> DATABASE_URL=... PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 node ./node_modules/@playwright/test/cli.js test jenan-map-real.spec --project=jenan-map-real
   RUN_JENAN_MAP_REAL_E2E=1 JENAN_MAP_LOCAL_RUN=<folder> DATABASE_URL=... PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 node ./node_modules/@playwright/test/cli.js test jenan-map-real-admin --project=jenan-map-real
   ```

**Member spec (`tests/e2e/jenan-map-real.spec.ts`): 13 of 13 passed** on 2026-10-19 (5.4 minutes in the final run, on the final code):

1. the published release loads its real style, layers, vector tiles (all `206`), glyph ranges including the Arabic block 1536-1791, with no failed request, no console error, a painted map and attribution text of at least 4.5:1 contrast;
2. **the §26 scenario**: Saudi Arabia → Riyadh → the district النرجس → the street طريق الملك فهد → a hospital POI, each picked from the real search response, with the marker at the middle of the map; confirm; the database row holds the exact point with its real region and city; after a full reload the picker reopens the same point and the API returns the same location;
3. the analysis ring for 500 m, 1 km, 3 km and 5 km is measured **in pixels from a screenshot** against the radius the zoom level and latitude imply: 236 px measured, 236 px expected, at all four radii, drawn in every direction and fully in view;
4. the same ring on a 390x844 phone is framed to the small map: 122 px measured, 121 px expected, drawn in 85 % of the directions (the point badge and the attribution cover the rest);
5. a device location inside Saudi Arabia is saved with source `geolocation`; one in Cairo is shown as a draft and refused by the server, and replaces nothing;
6. typed coordinates are checked against the real boundary: Cairo, Dubai and Sinai refused; the Empty Quarter accepted and saved with source `coordinates`;
7. a click and a dragged marker move the point by the distance they cover on the ground (within 5-7 %), and the saved point is the dragged one;
8. hiding the roads layer changes the real map and showing it again restores it; layers and radius saved with «حفظ إعدادات العرض» are restored after a reload;
9. a pan and zoom session of the real map: tile reads only, all `206`, none failed, no failure panel;
10. a burst of 600 glyph requests (about 555 a minute, three times the old whole budget) is served with `200` and search still answers;
11. the picker at 2560x1440, 1920x1080, 1440x900, 1366x768, 1280x800, 1024x1366, 820x1180, 430x932, 390x844 and 360x800: no sideways scrolling, every control inside the screen, a usable map;
12. `/`, `/login` and `/register` make no map request: no engine, no worker, no API call;
13. an unpublished release is refused to a member by every preview, artifact and asset route, and the private preview of it shows an error instead of a map.

Measured on the reference machine (a loaded 8 GB Windows laptop, `next dev`, software WebGL), so these are correctness figures, not performance claims: opening the picker to a painted map took 7.5 s; that first load made 17 map requests (6 ranged tile reads, 156 KB; 7 glyph ranges, 581 KB; the style, the manifest, the saved location and the preferences), none failed; the page's JavaScript heap was 35 MB; a 29 s pan and zoom session made 17 tile reads.

**Administration spec (`tests/e2e/jenan-map-real-admin.spec.ts`): 11 of 11 passed** on 2026-10-19 on the final code (scenarios 1-7 in one run and 8-11 in the next, because `next dev` restarted itself on its memory threshold between them: «Server is approaching the used memory threshold, restarting...»; a request in flight at that moment is refused). The 11 scenarios run against the same environment and with an administrator's real session:

1. the overview shows values that match the database: the runtime state, the published version, the dataset and layer counts read from PostgreSQL, the PMTiles size equal to the stored file, the PostGIS version and the storage status;
2. all ten sections open under their own titles with no error;
3. a release is previewed privately in its own (dark) style: painted, searchable, with no failed request, while a member still receives the published release;
4. a member sees the dark release after it is published, and the light one again after a roll back. On a freshly provisioned environment the dark release is approved and published here; on later runs it is rolled back to (it was published before). Every step asks for a reason and an explicit confirmation, the statuses are exactly Archived/Published and then Published/Archived, no release is deleted, and the audit records carry the administrator and the reason;
5. switching a layer off hides it from the member's picker and from search and deletes none of its data; switching it on restores it;
6. maintenance (the standard text and an administrator's own text) and disabled show members the exact message while `/dashboard` keeps working; the map is enabled again at the end;
7. a layer exports as GeoJSON, JSON, CSV and GeoPackage with the same real features, the same source, licence and attribution in every format (as columns on every CSV row), a byte order mark and Arabic names in the places CSV, and `GPKG` in the SQLite header;
8. a full backup is created and validated, restored as a new candidate (the production pointer does not move), and the candidate opens in private preview with real data;
9. the health section shows measured values and the feature count of every layer, reaches `ok` only after the deep verification, reports `failed` and names the file when a published file is moved away, and is `ok` again when it is put back;
10. the audit log lists the latest 100 records exactly as the database holds them, with who, which release and why, and shows the reason an administrator typed;
11. a member is refused every administration API.

On the reference machine approve, publish and roll back took about a minute together (each reads the 975 MB archive back), a full backup 2 to 4 minutes, its validation 20 to 60 seconds and the restore about 2 minutes. The administration spec changes the provisioned environment: release B ends Archived, a backup and restored candidates are left behind, and release A is published again. It can be repeated on the same environment (see scenario 4); provision a new environment to exercise approve and publish of B again.

### The same acceptance on a production build, under the enforced content security policy (2026-10-19)

Everything above ran on `next dev`, and a development server does not send the content security policy: the proxy sends it only in production. So the real map had never been seen under the policy that real members get (`script-src` with a nonce and `strict-dynamic`, no `'unsafe-eval'`; `worker-src 'self' blob:`; `connect-src 'self'`). It was run again on a production build (`npm run build`, `next start`, Redis for the rate limits, a loopback PostgreSQL 17 with PostGIS, the same real Saudi data):

```sh
JENAN_MAP_EXPECT_CSP=1 RUN_JENAN_MAP_REAL_E2E=1 JENAN_MAP_LOCAL_RUN=<folder> DATABASE_URL=... PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 node ./node_modules/@playwright/test/cli.js test jenan-map-real.spec --project=jenan-map-real
```

`JENAN_MAP_EXPECT_CSP=1` makes both real-data specs refuse to pass against a server that does not send the policy (or sends one with `'unsafe-eval'`), records every `securitypolicyviolation` event of every page, and fails the test that raised one. A violation raised inside a worker never reaches the page; those arrive at the policy's `report-uri` and are logged by the server as `[csp-violation]`, so the server log is read after the run. A deliberate blocked request was used to prove both channels work.

- **The CI audit that failed on the previous commit passes:** `csp-audit.spec.ts` "an administrator's application loads without violations", run against this production build, passed in 1.8 minutes with no violation on any administration page (including the ten `/admin/jenan-map/*` sections).
- **Member spec: 13 of 13 passed** on the production build (3.5 minutes), with no violation reported by any page and none in the server log. Measured with the same caveats as above (software WebGL, one loaded laptop): opening the picker to a painted map took 4.3 s, the page's JavaScript heap was 19 MB, the first load made 17 map requests (6 ranged tile reads, 7 glyph ranges, none failed), the ring measured 236 px against 236 px expected at all four radii, 600 glyph requests in 14 s were all served (`200`, 2,565 a minute, with the Redis-backed budget), and a 25 s pan and zoom made 19 tile reads (all `206`).
- **Administration spec: scenarios 1-6 and 9-11 passed** on the production build (overview, ten sections, private preview, approve, publish and roll back with a member's view, layer switch, maintenance and disabled, measured health with its deep check, audit log, member refusal). **Scenarios 7 (the GeoPackage step) and 8 (backup and restore) cannot run on a Windows production server, by design:** `assertPrivateDirectory` refuses a directory on Windows when `NODE_ENV=production`, because Windows reports fixed permission bits and production is Linux or macOS, where `0700` proves privacy. The GeoPackage export (SQLite needs private scratch space), an import and a restore answer `PRIVATE_STORAGE_REQUIRED` there. The GeoJSON, JSON and CSV exports passed in production; the GeoPackage, backup and restore scenarios passed on the development server (11 of 11 above). Running them under a Linux production build needs a Linux machine and is listed below.

### Defects the browser run exposed (fixed)

None of these could be seen by fixture tests, which mock the renderer.

- **The map had no height.** MapLibre's stylesheet arrives with the lazily loaded renderer chunk, after the dialog's CSS, and sets `position: relative` on the same element that the dialog's `.canvas` rule sets to `absolute`. With equal specificity the later rule won, the container collapsed to zero height and the user saw an empty panel while every request succeeded. The rule is now `.mapPanel > .canvas`. Guard: the member spec asserts the container is taller than 300 px and that the picture is mostly painted.
- **Updates were silently dropped.** A new radius, a layer switched back on or a new point was applied only when `isStyleLoaded()` was true, which is false while any tile or glyph is still loading (most of the time after a camera move), and the update was never retried. The renderer now waits only for the style's first load. Guards: the ring measurement at four radii and the hide-and-restore layer test.
- **Tiles, glyphs and the style shared a budget of 180 requests a minute** with searches and saves, although one screen of map is dozens of ranged reads, so panning could answer `429`, and the renderer treats any map error as fatal. Asset delivery now has its own budget (`jenan-map:assets`, 3,000 a minute per user, `MAP_ASSET_REQUESTS_PER_MINUTE`); the API, search and administrator budgets are unchanged, and a download (an export) keeps the tight administrator budget. Unit tests pin all three.
- **A search result left the camera at country zoom**, so the radius ring could be entirely off screen. A point chosen from search, the device or typed coordinates, and every new radius, now frame the whole ring (`cameraMoveFor` and `ringBounds` in `features/jenan-map/geometry.ts`); a click or a dragged marker only follows the point; the first pass obeys the saved viewport.
- **The attribution was unreadable** (pale text on a pale pane). It now has a dark pane (about 8.5:1). The attribution is a legal notice of the ODbL and CC BY terms, so it is asserted at 4.5:1 in the browser.
- **On a phone** the point badge covered the attribution and the map was short. The badge clears it and the map is `clamp(310px, 42dvh, 480px)` tall.
- **The stopped-map message** is now exactly «Jenan PRO Map قيد التحديث حاليًا، ستعود الخدمة قريبًا.» for maintenance (the default text of the form) and for a disabled map; an administrator's own maintenance wording is shown in maintenance. The rest of the platform keeps answering (the browser run opens `/dashboard` while the map is stopped). The text is the single constant `MAP_STOPPED_MESSAGE`.
- **The first open could time out.** The first request for a map after the server starts, or after a release is imported or restored, makes the server verify every file of the release (a `SHA-256` over the 975 MB z15 archive took 10 s on the reference machine, 24 s once), and the picker gave up after 10 s with «انتهت مهلة الاتصال». The manifest now waits up to 120 s (`MANIFEST_TIMEOUT_MS`) and after 6 s the dialog says that the first open checks the files and may take about a minute. A fixture browser test holds the manifest for 12 s. With the S3 driver the check is a `HEAD` and a recorded checksum per object, so this concerned the filesystem driver; concurrent first requests share one verification.
- **The administration pages broke the content security policy audit** (found by CI's production-build job, because the browser runs above use a development server, which sends no policy). The administration shell took the constant `MAP_STOPPED_MESSAGE` from `services/jenan-map/contracts.ts`, which builds zod schemas. zod 4 probes for script evaluation (`new Function`) as it builds a schema, and the production policy has no `'unsafe-eval'`, so each of the ten map pages reported an `eval` violation. The member map had the same latent probe through `features/jenan-map/preferences-api.ts`, which CI never opens. The rule is now: **browser code of the map imports no schema library.** `MAP_STOPPED_MESSAGE` lives in the import-free `services/jenan-map/messages.ts`, and saved preferences are checked in the browser by `parseMapPreferences` (`services/jenan-map/preferences-shape.ts`). Guards: `tests/unit/jenan-map-client-bundle.test.ts` fails if any browser module of the map, or either shared module, imports zod or the server contracts; `tests/unit/jenan-map-preferences.test.ts` holds the browser validator and the server's schema to the same answer on 45 valid and invalid values; and the real-data specs can audit the policy (`JENAN_MAP_EXPECT_CSP=1`, above).
- **A fault inside a map route was invisible.** `failure()` answered any error that was not a coded `MapError` with a bare `503 MAP_UNAVAILABLE` and logged nothing, so an operator saw no cause. Unexpected errors are now written to the server log (`jenan-map request failed`, through the shared `logUnexpected`) and the client still learns nothing about them. The three handlers that answer a truthful "unavailable" instead of an error (the member's manifest, the administrator's overview and the layer catalog) kept their answers exactly but had the same blind spot, found by the final review; they log the cause now too, and a coded outcome (`MapError`) is never logged. Guards: `tests/unit/jenan-map-http-failure.test.ts` and `tests/unit/jenan-map-fallback-logging.test.ts`.

### CodeQL alert 14 (`js/http-to-file-access`): analysis, hardening and disposition

**What it reports.** `scripts/jenan-map/prepare-open-data.mjs`, line 48, the `save()` helper: network data (the JSON answer of the geoBoundaries metadata endpoint) is written to a file. The rule is *Network data written to file* (`@security-severity 6.3`, medium; CWE-434 and CWE-912): writing network data to disk without validation can allow an arbitrary file upload or hide a backdoor. It was reproduced locally with the CodeQL version CI uses (2.27.2, `security-extended`): one result and one data flow, from `fetch(...)` through `retainedMetadata(...)` to `save(...)`.

**Why it is not an exploitable path here.**

- The script is an operator tool, run by hand with an absolute path. No request handler, service or CI job imports or runs it; only unit tests import its helpers.
- It refuses to run unless the output folder is new, absolute, outside `public/`, not a symbolic link and private (mode 0700). Every file is created exclusively (`wx`, never overwritten) with mode 0600, and every file name is a fixed constant, so no network value ever chooses a path.
- What is written is data, never code: `JSON.stringify` output of whitelisted keys (`retainedMetadata`: named fields only, strings cut to 2,000 characters, finite numbers, nothing nested), the downloaded GeoJSON and PBF bytes, and fixed templates. Nothing is executed, imported, served or placed where a browser can reach it.
- It downloads only from a reviewed list of hosts, over HTTPS, re-checking every redirect and following at most five.
- Everything it records is checked again before it is used: `validateProvenance` (type, length, HTTPS URL, dates, licence from a fixed list) and the SHA-256 of every source file when a release is prepared, `validateCoverage` when it is imported, and an administrator's explicit confirmation at every step. Nothing is published automatically.

**Hardening done for this review.** The data flow is unchanged; the checks in front of it are stricter. Text recorded as provenance (`boundaryID`, `boundarySource`) is refused, never truncated, unless it is plain visible text of bounded length (no control, line-separator or text-direction characters) and the identifier has the form `SAU-<level>-<digits>`. The download URL named by unpinned metadata is checked against the reviewed hosts before it is recorded or fetched, and a metadata answer larger than 1 MiB is not read. No file is written for a level whose answer fails a check. `tests/unit/jenan-map-acquire-hardening.test.ts` drives the real acquisition against a stubbed network (the real answer, then hostile ones), and the six real answers for Saudi Arabia (the pinned revision and the live API, ADM0 to ADM2) were also run through the new checks.

**Why the alert remains, and what was tried.** The rule defines no sanitizer of its own, and the generic ones are membership and containment tests (`includes`, `has`, `in`) and null or emptiness checks, not validation by pattern, length or character class. The retained evidence is free upstream text (names, licence wording, URLs, dates), so it cannot become a membership test without dropping the evidence, and moving the same write behind a file or a stream would hide the flow from the analyser without changing what happens. Neither was done. After the hardening above, the local run still reports the same single result.

**Disposition.** *Won't fix*, recorded on the alert itself with this section as its justification: the finding is accurate (network data is written to a file) but is not exploitable in the context above. It must be reopened if the script ever becomes reachable from the web application or CI, or writes anywhere but a new private folder.

### Measured health (admin → الحالة التشغيلية)

The health section used to be static "unknown" text. `GET /api/admin/jenan-map/health` now measures, on every refresh: the database round trip, PostGIS (asked for its version and timed), the storage driver (the filesystem, or a listing of the bucket with the configured credentials), the runtime state and whether the production pointer leads to a release that is Published, every file of the published release (present and of the recorded size, by a `stat` or a `HEAD`, without reading its bytes), and the feature count of each layer with the recorded boundary. A check that cannot be taken is reported as failed, never skipped, and the verdict is `failed`, `attention` or `ok`.

The verdict is **`ok` only after a deep verification**: `POST` with `{"action":"verify-published"}` (the button «فحص عميق لملفات الإصدار المنشور») reads every file back from storage and runs the checks that approval runs (checksums, the PMTiles container, the style, glyph and sprite references, the Saudi coverage evidence). Concurrent requests share one run; it takes as long as the files are big (minutes for the z15 archive); each run is recorded in the audit log as `health.verify` with who ran it, how long it took and how many bytes it read. What the server cannot know is listed as not measured and is never shown as healthy: rendering in a browser, CDN and caching, and performance under load. Administrators only; the verification also requires a same-origin request. `tests/unit/jenan-map-health.test.ts` covers the verdicts, a missing or resized file, an unreachable database, the object-store path, the shared verification run and the route's access rules.

### Production verification requirements (not simulated here)

These need an environment this work does not have, and none of them is claimed as passed:

- **Live shared object storage.** A real Cloudflare R2 or AWS S3 bucket: ranged PMTiles reads, the full read-and-hash of the 975 MB z15 archive that approval, publication, rollback and the deep verification perform (these requests must fit the hosting platform's request time limit; `maxDuration = 300` is set on them, the platform's own cap decides), credential rotation and latency from the application's region. Objects above 5 GiB need multipart upload, which is not implemented.
- **CDN and caching.** Map assets are authenticated and release-pinned, so they are sent `private, no-store`. If a CDN is placed in front, its cache keys, `Range` handling and cookie handling have to be verified, and whether published immutable artifacts may be cached publicly is a product decision.
- **Production PostgreSQL 17 with PostGIS.** The map migration chain applied by a DBA, and query latency on the real feature table under concurrent users (this work measured one user on a laptop).
- **A Linux production build with the real data.** The development-server run covers the GeoPackage export, import and restore; a Windows production server refuses them by design (the private-directory guard, above), so the same scenarios under a Linux `next start` are left for the environment that can run them.
- **Browser and load on real infrastructure.** First paint and memory on real devices with hardware WebGL, concurrent users, mobile networks. The figures above come from software WebGL on a loaded laptop.
- **SonarQube for IDE connected mode.** It needs the owner's SonarQube Cloud sign-in inside VS Code. The SonarQube Cloud analysis of the pull requests is already enforced in CI.
- **CodeQL alert 14** (`js/http-to-file-access` in `scripts/jenan-map/prepare-open-data.mjs`): analysed, the script hardened and the alert recorded as *won't fix* with its justification; see "CodeQL alert 14" above. It exists only on the pull request's merge ref, and the owner can reopen it at any time.

### Still open after this change

Inside the map's scope, everything that can be verified on one machine has been verified. What remains is:

- **Known limits of v1:** the production style carries no sprite sheet (POIs are vector symbols with Arabic and English labels), so sprite delivery, bounds validation and the JSON, PNG and `@2x` variants are covered by fixture tests only, in published and preview mode; a release carries exactly one style (a dark map is a separate release, there is no in-app theme toggle); backups stay on a private local folder; a server that dies in the middle of a restore leaves an inert `Processing` candidate (it can never be approved, nothing is published or changed) because nothing is left running to mark it failed; a server that dies in the middle of a backup leaves an inert `.partial` staging folder that is never listed and is safe to delete.
- **Search ranking.** Matches are ordered by text-search score and then by feature id, and ids are drawn at random for each build. A very common name therefore returns 20 of its equally ranked matches in an arbitrary order: «الرياض» matches 154 features (125 roads, 23 POIs, 6 places) with one and the same score, so the city can be missing from the first 20 (about 4 builds in 10 on the real data) unless the places layer is the one searched, as the picker does for the layer it is switched to. A relevance tie-break (an exact name first) would remove this; it changes what users see and is therefore not part of this closure.
- **Browser suites run locally.** The 31-test fixture suite (`--project=jenan-map`) and the real-data suites are not part of the CI groups; CI runs the unit tests, the production-build policy audit and the other groups. Adding the fixture project to a CI group is a one-line change that has not been made.
- **Deferred by the owner:** integration with Project Analysis, Start Project and Feasibility. `features/jenan-map/project-adapter.ts` still only adapts coordinates; the analysis screen still uses its own Leaflet picker, which loads OpenStreetMap's public tile server unless `NEXT_PUBLIC_MAP_TILE_URL` is set. Replacing it changes a closed baseline.
- **The production verification requirements above.**