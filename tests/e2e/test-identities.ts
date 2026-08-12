const runId = process.env.E2E_RUN_ID;
if (!runId) throw new Error("E2E_RUN_ID is not configured by Playwright");

export const e2eIdentity = {
  user: {
    email: `e2e.user.${runId}@example.test`,
    password: `E2E-user-${runId}-Strong!`,
    displayName: "E2E User",
  },
  admin: {
    email: `e2e.admin.${runId}@example.test`,
    password: `E2E-admin-${runId}-Strong!`,
    displayName: "E2E Admin",
  },
};
