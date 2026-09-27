# [70% BASELINE][PASS] Academy Content Library

## Done

- Added a source-aware academy resource registry for courses, webinars, studies, research, learning paths, and certificates.
- Each resource stores source name/URL/date, author, category, language, current version, approval state, approver, and approval date.
- Versions are immutable records with content, references, source metadata, change summary, author, state, and creation date.
- Attachments support cloud storage keys or approved external URLs with MIME type, size, checksum, and source metadata.
- Admin API commands create resources, create new versions, submit/review/approve/archive resources, and add attachments.
- Ordinary users only receive approved resources. Approval fails without source name, source date, and author.
- Academy list/detail/reader pages support search, categories, metadata, references, attachments, and version history.
- Empty pages state `Awaiting approved source`; no content records were fabricated.

## QA

- Prisma format, validate, generate, and migration deploy: passed (`20260927143000_add_academy_content_library`).
- Content version/source/approval/attachment integration: passed.
- Admin API to approved user reader E2E: passed.
- Existing Academy full route E2E: 2 passed, including mobile responsiveness.
- ESLint, TypeScript, production build, and `git diff --check`: passed.
- Production build generated 121 route entries.
- Snyk Code is required but unavailable in the current tool environment; no dependency was added.

## External boundary

- Webinar streams, licensed studies/research, and external files remain `BLOCKED BY EXTERNAL PROVIDER` until approved sources are connected.
- The internal contracts, API, review workflow, search, reader, version history, and attachment metadata are complete and provider-neutral.