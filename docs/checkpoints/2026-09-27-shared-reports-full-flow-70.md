# [70% BASELINE][PASS] Shared Reports Full Flow

## Implemented

- Added independent report pages for `/reports/view/general`, `/reports/print/project-analysis`, `/reports/print/project-evaluation`, `/reports/view/portfolio`, and `/reports/view/investment`.
- Project reports use the authenticated user's persisted project, assessment, risk, evidence, and intelligence records.
- Portfolio and investment reports remain source-ready and explicitly display `AWAITING_APPROVED_SOURCE` without estimated values.
- Print/PDF uses dedicated print CSS; native sharing or clipboard fallback works. Email is visibly disabled until an approved email provider is connected.
- Added explicit redirects: `/home` to `/`, `/admin/ai` to `/models`, `/admin/agents` to `/robots/factory`, and `/admin/health` to `/observability/health`.
- User report and investment pages link to the new report views.

## Acceptance

- Report route contract: 2 tests passed.
- Report and legacy redirect E2E: 3 tests passed.
- Mobile report layout at 390x844: no document overflow.
- ESLint, TypeScript, production build, and `git diff --check`: passed.
- Production build generated 120 route entries.
- Snyk Code is required but unavailable in the current tool environment; no dependency was added.