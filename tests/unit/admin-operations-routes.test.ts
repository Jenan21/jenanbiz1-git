import { describe, expect, it } from "vitest";

import { ADMIN_OPERATION_ROUTES, findAdminOperationRoute } from "@/lib/admin/admin-operations-routes";

describe("admin operations route manifest", () => {
  it("contains the exact 80 authoritative pages without duplicates", () => {
    expect(ADMIN_OPERATION_ROUTES).toHaveLength(80);
    expect(new Set(ADMIN_OPERATION_ROUTES.map((route) => route.path)).size).toBe(80);
    expect(ADMIN_OPERATION_ROUTES.filter((route) => route.group === "academy")).toHaveLength(14);
    expect(ADMIN_OPERATION_ROUTES.filter((route) => route.group === "missions")).toHaveLength(10);
  });

  it("resolves sensitive routes and rejects undeclared paths", () => {
    expect(findAdminOperationRoute("/missions/sample/evidence")?.kind).toBe("evidence");
    expect(findAdminOperationRoute("/tools/permissions")?.kind).toBe("matrix");
    expect(findAdminOperationRoute("/admin/reports/system")?.group).toBe("reports");
    expect(findAdminOperationRoute("/admin/funding")).toBeNull();
  });
});