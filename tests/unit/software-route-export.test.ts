import { describe, expect, it } from "vitest";

import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";
import { buildSoftwareRouteExport, serializeSoftwareCsv } from "@/lib/software/route-export";

describe("Software route exports", () => {
  it("serializes route records with a UTF-8 BOM and neutralizes spreadsheet formulas", () => {
    const workspace = { company: { currentUserIsOwner: true }, sales: { customers: [{ name: "=2+2", email: "buyer@example.test", phone: null, taxNumber: null, status: "ACTIVE" }] } } as SoftwareWorkspaceData;
    const output = buildSoftwareRouteExport("sales-customers", workspace, "en")!;
    const csv = serializeSoftwareCsv(output);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=2+2");
    expect(csv).toContain("buyer@example.test");
  });

  it("does not expose HR exports to non-owners", () => {
    const workspace = { company: { currentUserIsOwner: false }, hr: { employees: [] } } as unknown as SoftwareWorkspaceData;
    expect(buildSoftwareRouteExport("hr-employees", workspace, "en")).toBeNull();
  });
});