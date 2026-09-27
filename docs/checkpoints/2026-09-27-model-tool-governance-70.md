# [70% BASELINE][PASS] Model and Tool Governance

## Done

- Added persistent model registry entries with provider/model keys, capabilities, status, quality, average latency, token cost, context window, and enablement state.
- Added deterministic routing rules using task type, priority, quality, latency, cost, and required capabilities.
- Added ordered fallback model links and routed execution history with trace IDs, cost, quality, latency, selected rule, and failure details.
- Added persistent tool definitions, role permissions, scopes, least-privilege deny records, approval-required tools, approval decisions, and execution history.
- Governed tools execute only registered local handlers after permission and approval checks.
- Replaced model/tool placeholder panels with live registries, rules, fallbacks, permissions, and execution records.
- Added operational consoles for registering models/tools, assigning rules/permissions, testing routing, and requesting/approving execution.

## QA

- Prisma validate, generate, and migration deploy: passed (`20260927173000_add_model_tool_governance`).
- Model routing/fallback/execution and tool least-privilege/approval integration: 2 passed.
- API and Models/Tools UI E2E: passed.
- ESLint, TypeScript, production build, and `git diff --check`: passed.
- Production build generated 124 route entries.

## External boundary

- Provider credentials and network invocation remain adapter concerns. The registry, selection policy, fallbacks, permissions, approvals, and execution records are complete without activating an external provider.