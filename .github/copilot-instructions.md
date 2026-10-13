# Jenan PRO Project Instructions

## Authority

- Treat `design-references/Jenan-PRO/EXECUTION_MASTER.md` and the three archives under `design-references/Jenan-PRO/` as the authoritative implementation references.
- For the homepage, the visual authority for the scene is `design-references/Jenan-PRO/APPROVED_HOME_REFERENCE/homepage.png`, and the final decisions in `APPROVED_HOME_REFERENCE/README.md` override it where they remove or replace elements. It supersedes all older Home, landing, pre-entry, experimental, and alternate candidates.
- The canonical homepage is frozen after acceptance. Change it only to fix a verified regression or to implement a new explicit product decision.
- For authentication panels, the only visual authorities are `design-references/Jenan-PRO/APPROVED_AUTH_REFERENCES/login-1672x941.png` and `register-1448x1086.png`. They supersede Auth `reference.html`, `spec.txt`, and alternate/legacy candidates.
- Keep exactly one production public interface, Auth flow, Auth component, and Auth stylesheet. `/` is pre-entry, `/auth` and `/login` are sign-in, and `/register` is account creation; compatibility aliases must reuse the same implementation.
- The pre-login page keeps its approved decisions: no large platform title, no top navigation/search/bell, no news/statistics/distribution strip, no lower trust-icon row, and no large circular auth entries. Never restore them. The bottom area is the seven service panels from `design-references/Jenan-PRO/APPROVED_HOME_REFERENCE/service-panels/` (one static panel every 3 seconds, very light fade/slide, no motion inside the scene); the Auth entries are two small rectangular buttons under the globe.
- The archives complement one another. Follow the newest detailed Jenan PRO page reference first, then its `reference.html`, `spec.txt`, and general blueprint.
- Use legacy Jenan BIZ material only for visual direction. All new visible identity must read `Jenan PRO` or `جنان برو`.

## Product Scope

- Implement complete section flows, not dashboard-only placeholders. A service is incomplete until its child routes, inputs, processing states, results, details, outputs, and relevant reports work.
- Funding Eligibility is permanently removed. Do not add or expose funding routes, navigation, cards, search entries, reports, or admin links. Inspect dependencies before any safe backend/schema cleanup; never reset the database.
- Preserve the existing Auth, Sessions, RBAC, rate limiting, audit, Prisma/PostgreSQL, Redis, API, worker, and security architecture unless a verified defect requires a focused change.
- Financial formulas and other deterministic calculations must remain deterministic. Use AI only for appropriate analysis and recommendations.
- Never present demo values as production data. Use truthful empty, unavailable, estimated, source, date, confidence, and review states.
- Every visible action must work or be clearly disabled. Do not expose unsupported export formats.

## Visual Implementation

- Build real React/CSS/SVG components. Reference screenshots and HTML are visual authorities only and must never be used as production page backgrounds. The single explicit exception is the cropped scene photo of each bottom service panel on the pre-login page (`APPROVED_HOME_REFERENCE/service-panels/README.md`), shipped as a background layer under real text.
- Preserve the Jenan PRO design family: dark premium futuristic, deep navy/black-blue, electric cyan/teal, controlled emerald/gold/purple accents, glass depth, restrained glow, clear hierarchy, strong typography, and professional data/AI visuals.
- Never stretch key assets or use `object-fit: fill`. Avoid overlap, accidental horizontal scrolling, clipped text, and large reference-image gutters.
- Recompose layouts for desktop, laptop, tablet, and mobile using Grid/Flexbox, `minmax()`, `clamp()`, percentages, and content-driven breakpoints.
- Test at 2560x1440, 1920x1080, 1440x900, 1366x768, 1280x800, 1024x1366, 820x1180, 430x932, 390x844, and 360x800 when the section reaches visual acceptance.

## Delivery Gate

- Work section by section in the sequence defined in `EXECUTION_MASTER.md`; do not rebuild a section that already passes the current baseline.
- Use this gate before moving on: full section and child pages, functional QA, responsive QA, visual comparison, approximately 70% reference fidelity, lint, typecheck, relevant tests, build, clear commit, and local archive confirmation.
- Preserve design archives and extracted references for later 80%, 90%, and 100% refinement.
- Keep changes focused and reuse shared headers, navigation, buttons, inputs, cards, tables, charts, report actions, dialogs, empty states, loaders, and error states.
- After each section, report implemented pages/routes, tested behavior, functional/responsive/visual results, remaining differences, checks, commit hash, repository/local-save status, and real blockers.
- This closure rule applies to every section without exception: once the delivery gate passes, the commit is pushed, and the local and remote hashes match, treat that section as an accepted, closed baseline.
- Later explicit requests may improve visual fidelity, performance, accessibility, efficiency, or add capabilities without invalidating the earlier closure. Apply them as focused, versioned refinements; do not reopen or rebuild a closed section by default unless fixing a verified regression or implementing an explicit product decision.