# [70% BASELINE][PASS] Jenan Robotics User Flow

## Implemented pages and routes

- `/robotics` public authenticated Robotics dashboard.
- `/robotics/search` requirement search.
- `/robotics/results` filtered public robot results.
- `/robotics/item/sample` sanitized robot specification detail.
- `/robotics/recommendations` explainable comparison and recommendations.
- Legacy `/software/robotics` redirects to the authoritative `/robotics` route.

## Functional and security QA

- Only active, visible robots with `CERTIFIED` or `OPERATIONAL` academic profiles are returned.
- Public results use an explicit Prisma select and never expose notes, team identifiers, tasks, missions, costs, model runs, runtime allocations, evidence, or genome data.
- Search evaluates task, sector, location, and environment against published profile data.
- Recommendations use deterministic academic readiness plus supplied criteria and expose reasons and gaps.
- Budget compatibility is reported as unavailable because no public pricing source is connected.
- Users can submit and track information requests; this action creates no robot task, execution, model run, evidence, or cost.
- Admin robot pages and APIs remain inaccessible to ordinary users (403).

## Responsive and visual QA

- All five user Robotics routes render without document overflow.
- Dashboard, results, item detail, and recommendations pass at 2560x1440, 1920x1080, 1440x900, 1366x768, 1280x800, 1024x1366, 820x1180, 430x932, 390x844, and 360x800.
- Direct visual comparison completed against references 140 and 143.
- Hero, metrics, search, result cards, public specifications, recommendation reasons/gaps, and request flow follow the Jenan PRO reference family.
- Approximate current visual fidelity: 72–76%.

## Remaining differences

- Robot media galleries are unavailable because no approved public asset source exists.
- Public pricing, availability booking, comparison persistence, and vendor contact require approved providers and commercial policy.
- Information requests require an administrative review workflow before user-facing status can move beyond `REQUESTED`.
- Robot execution remains intentionally restricted to authenticated administrative orchestration endpoints.

## Engineering checks

- Prisma validate, generate, and migration deploy: passed (`20260927074500_add_robot_information_requests`).
- Robotics route and public-domain suites: 3 passed.
- Public search/request/admin-isolation/route/responsive E2E: passed.
- Full platform user journey with the canonical Robotics route: passed.
- ESLint: passed.
- TypeScript: passed.
- Production build: passed (110 routes generated).
- Snyk Code tool was required by repository instructions but is unavailable in the current tool environment; no dependencies were added.