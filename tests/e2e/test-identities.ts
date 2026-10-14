const runId = process.env.E2E_RUN_ID;
if (!runId) throw new Error("E2E_RUN_ID is not configured by Playwright");

export const e2eIdentity = {
  user: {
    email: `e2e.user.${runId}@example.test`,
    password: `E2E-user-${runId}-Strong!`,
    displayName: "E2E User",
  },
  visualUser: {
    email: `e2e.visual.${runId}@example.test`,
    password: `E2E-visual-${runId}-Strong!`,
    displayName: "E2E Visual User",
  },
  admin: {
    email: `e2e.admin.${runId}@example.test`,
    password: `E2E-admin-${runId}-Strong!`,
    displayName: "E2E Admin",
  },
  // matches the `e2e.admin.%` pattern, so the fixture cleanup removes it together with the administrator
  superAdmin: {
    email: `e2e.admin.super.${runId}@example.test`,
    password: `E2E-super-${runId}-Strong!`,
    displayName: "E2E Super Admin",
  },
};
