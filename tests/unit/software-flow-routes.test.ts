import { describe, expect, it } from "vitest";

import { SOFTWARE_EXPERIENCE_ROUTES, resolveSoftwareExperienceFlow } from "@/lib/software/software-experience-routes";
import { SOFTWARE_FLOW_ROUTES, resolveSoftwareFlow } from "@/lib/software/software-routes";

describe("Jenan Software route manifest", () => {
  it("matches all 24 authoritative routes", () => {
    expect(SOFTWARE_FLOW_ROUTES.map((definition) => definition.route)).toEqual([
      "/software/business",
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

  it("covers the approved software portal, file, conversion, and design routes", () => {
    expect(SOFTWARE_EXPERIENCE_ROUTES.map((definition) => definition.route)).toEqual([
      "/software",
      "/software/files",
      "/software/files/images-to-pdf",
      "/software/files/merge-pdf",
      "/software/files/split-pdf",
      "/software/files/compress-pdf",
      "/software/files/word-to-pdf",
      "/software/files/pdf-to-word",
      "/software/files/pdf-to-excel",
      "/software/files/excel-to-pdf",
      "/software/design",
      "/software/design/logo",
      "/software/design/letterhead",
      "/software/design/cv",
      "/software/design/docs",
      "/software/design/sheets",
      "/software/design/presentations",
      "/software/design/history",
    ]);
    expect(resolveSoftwareExperienceFlow(["files", "images-to-pdf"])?.id).toBe("images-to-pdf");
    expect(resolveSoftwareExperienceFlow(["design", "cv"])?.id).toBe("design-cv");
    expect(resolveSoftwareExperienceFlow(["funding"])).toBeNull();
  });

  it("resolves only allowlisted child routes", () => {
    expect(resolveSoftwareFlow(["sales", "customers"])?.id).toBe("sales-customers");
    expect(resolveSoftwareFlow(["hr", "payroll"])?.id).toBe("hr-payroll");
    expect(resolveSoftwareFlow(["funding"])).toBeNull();
  });
});