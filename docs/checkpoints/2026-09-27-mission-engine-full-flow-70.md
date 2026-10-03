# [70% BASELINE][PASS] Persistent Mission Engine

## Done

- Added persistent mission runs with trace IDs and the lifecycle `CREATED -> QUEUED -> RUNNING -> WAITING_APPROVAL -> RETRY/FALLBACK -> COMPLETED/FAILED`.
- Added subtasks, parent-child structure, cycle-safe dependency DAG, retry policies with deterministic backoff, ordered fallback policies, attempts, approvals, escalations, evidence links, costs, and immutable history events.
- Every transition validates the current state and writes a traceable history record.
- Evidence and costs link to mission, run, and execution attempt.
- Added protected same-origin Admin API commands for all internal lifecycle operations.
- Replaced Mission placeholder panels with live runs, dependencies, policies, approvals, escalations, history, evidence, and cost data.
- Added an operational command console whose visible controls call the real API.

## QA

- Prisma validate, generate, and migration deploy: passed (`20260927150000_add_mission_engine`).
- Full lifecycle integration with retry, fallback, approval, escalation, evidence, cost, and history: passed.
- API-to-command-center E2E: passed.
- Existing 80-route Admin Operations regression: passed during the section gate.
- ESLint, TypeScript, production build, and `git diff --check`: passed.
- Production build generated 122 route entries.
- External execution providers remain optional; the state machine and contracts work without them.