# Academy Screen Refinement — 100 Percent Gate

## Done

- Academy reference workspaces now expose stable `data-academy-route`, `data-academy-kind`, and `data-academy-source` contracts.
- Connected course/resource readers and approved-source empty states are distinguishable for targeted page acceptance.
- Course detail, lesson player, assessment, result, and certificate use distinct route-specific compositions.
- Lesson completion, private notes, exam attempts, and certificates are persisted and audited.
- Exam scores are calculated only on the server from approved questions and answer options; learner-entered scores are rejected.
- Approved webinars, studies, research, and learning paths use distinct catalog, reader, live-room, and timeline compositions with a persistent Engagement Ledger.
- Certificates support Print/PDF, share a public verification URL, and expose no learner email or private account data.
- The Academy dashboard covers courses, lessons, studies, research, webinars, paths, certificates, and learner progress from live records.

## QA

- Academy full route E2E: 2 passed across all 16 screens and ten required viewports.
- Academy resource and learner journey E2E: 2 passed, including Admin question creation, study save, private note, server grading, result, certificate, and public verification.
- Academy learner certification integration: passed.
- TypeScript: passed.
- Prisma migrations `20260928010000_add_academy_assessment_content` and `20260928013000_add_academy_resource_engagement`: applied without destructive statements.

## External boundary

- Live streams and licensed external files remain unavailable until an approved provider supplies a valid source URL. The UI states this explicitly and does not fabricate content.