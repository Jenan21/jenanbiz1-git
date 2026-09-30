# Jenan PRO Project Instructions

## Authority

- Treat `design-references/Jenan-PRO/EXECUTION_MASTER.md` and the three archives under `design-references/Jenan-PRO/` as the authoritative implementation references.
- For the homepage, the only visual authority is `design-references/Jenan-PRO/APPROVED_HOME_REFERENCE/homepage.png`. It supersedes all older Home, landing, pre-entry, experimental, and alternate candidates.
- The canonical homepage is frozen after acceptance. Change it only to fix a verified regression or to implement a new explicit product decision.
- For authentication panels, the only visual authorities are `design-references/Jenan-PRO/APPROVED_AUTH_REFERENCES/login.png` and `register.png`. They supersede Auth `reference.html`, `spec.txt`, and alternate/legacy candidates.
- Keep exactly one production public interface, Auth flow, Auth component, and Auth stylesheet. `/` is pre-entry, `/auth` and `/login` are sign-in, and `/register` is account creation; compatibility aliases must reuse the same implementation.
- The large left-side platform title shown in the historical pre-entry source is an intentionally removed element. Keep the approved Jenan PRO logo, but never restore a large repeated platform name there.
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

- Build real React/CSS/SVG components. Reference screenshots and HTML are visual authorities only and must never be used as production page backgrounds.
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