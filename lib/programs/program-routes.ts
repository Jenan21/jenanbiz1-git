export const PROGRAM_ROUTES = [
  { id: "overview", path: "/programs", program: "ALL", source: "ORGANIZATION_PROGRAM_RECORDS" },
  { id: "people", path: "/programs/people", program: "PEOPLE", source: "ORGANIZATION_MEMBERSHIPS" },
  { id: "fleet", path: "/programs/fleet", program: "FLEET", source: "FLEET_RECORDS" },
  { id: "finance", path: "/programs/finance", program: "FINANCE", source: "FINANCIAL_LEDGER_RECORDS" },
  { id: "field", path: "/programs/field", program: "FIELD_OPERATIONS", source: "FIELD_ASSIGNMENT_RECORDS" },
] as const;

export type ProgramRoute = (typeof PROGRAM_ROUTES)[number];