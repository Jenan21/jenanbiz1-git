# Funding Eligibility Removal

## Product decision

Funding Eligibility is removed from the Jenan PRO product surface.

## Removed

- User navigation entry.
- `/funding-eligibility` page.
- `/api/funding` endpoint.
- Funding workspace component.
- Funding assessment runtime service.
- Account and dashboard funding queries and UI records.
- Funding-specific styles, documentation, and active test workflow.

## Data safety

The `FundingAssessment` Prisma model and its historical migration remain temporarily because the local database contains one historical record. No runtime code queries or writes this table. Removing it requires a separately approved backup and migration plan; no database reset or destructive cleanup was performed.

## Verification

- Runtime source search finds no funding references except explicit E2E assertions for removed routes.
- `/funding-eligibility` returns `404`.
- `/api/funding` returns `404`.
- Account overview integration test passes.
- User dashboard integration test passes.
- `npm run typecheck` passes after regenerating route state.
- `npm run test:e2e:journey` passes.