# [70% BASELINE][PASS] Intelligence Versioning Full Flow

## Done

- Added immutable knowledge versions, source URL/date, confidence, approval state, reviewer decisions, evidence links, and audit records.
- Existing shared knowledge was backfilled to version 1 without deleting or replacing records.
- Updates create a new version and reset approval to draft.
- Approval requires source and source date.
- Version diff reports changed lines and source/confidence changes.
- Rollback creates a new draft version copied from the target version and records `rollbackFrom`; no historical version is deleted.
- Added protected Admin API and an operational UI for create/version/review/approve/rollback.
- Intelligence panels now use real knowledge versions and reviews while retaining learning logs and robot evolution.

## QA

- Prisma validate, generate, migration deploy, and backfill: passed (`20260927162000_add_knowledge_versioning`).
- Version/review/evidence/diff/rollback integration: passed.
- API and Intelligence UI E2E: passed.
- ESLint, TypeScript, production build, and `git diff --check`: passed.
- Production build generated 123 route entries.