# Project Screen Refinement — 100 Percent Gate

## Done

- Every project child route now passes its exact `route` and `kind` into the workspace.
- Workspace screens expose stable `data-project-route`, `data-project-kind`, and `data-project-view` contracts for targeted visual and E2E acceptance.
- Each screen has an explicit bilingual screen label and sourced-record state.
- Accessibility naming now reflects the current project evaluation screen rather than only the shared workspace.
- Mobile heading treatment avoids badge overlap and preserves the source-state signal.
- Every child route now renders only its declared focus panel instead of the entire shared operations workspace.
- Project launch licenses/procedures and vendors/partners are persistent, organization-safe records with audited status transitions.
- Desktop and mobile visual inspection confirmed the dedicated license and vendor compositions without horizontal overflow.

## QA

- TypeScript: passed.
- Projects domain integration, including launch records and RBAC: passed.
- Projects route-flow E2E: 2 passed.
- Responsive representative project flows: passed.
- Prisma migration `20260927210000_add_project_launch_records`: applied without destructive statements.