import { describe, expect, it } from "vitest";

import { SOFTWARE_FLOW_ROUTES, resolveSoftwareFlow } from "@/lib/software/software-routes";

describe("Jenan Software route manifest", () => {
  it("matches all 24 authoritative routes", () => {
    expect(SOFTWARE_FLOW_ROUTES.map((definition) => definition.route)).toEqual([
      "/software",
      "/software/sales",
      "/software/sales/customers",
      "/software/sales/quotes",
      "/software/sales/orders",
      "/software/sales/invoices",
      "/software/sales/receipts",
      "/software/sales/products",
      "/software/sales/returns",
      "/software/sales/reports",
      "/software/accounting",
      "/software/hr",
      "/software/hr/employees",
      "/software/hr/attendance",
      "/software/hr/leave",
      "/software/hr/payroll",
      "/software/hr/performance",
      "/software/inventory",
      "/software/crm",
      "/software/projects",
      "/software/pos",
      "/software/purchases",
      "/software/company",
      "/software/reports",
    ]);
  });

  it("resolves only allowlisted child routes", () => {
    expect(resolveSoftwareFlow(["sales", "customers"])?.id).toBe("sales-customers");
    expect(resolveSoftwareFlow(["hr", "payroll"])?.id).toBe("hr-payroll");
    expect(resolveSoftwareFlow(["funding"])).toBeNull();
  });
});