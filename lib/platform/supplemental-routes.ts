export const SUPPLEMENTAL_ROUTES = [
  { id: "benefits", path: "/benefits", source: "PLATFORM_CAPABILITY_SUMMARY", state: "INFORMATIONAL" },
  { id: "pricing", path: "/pricing", source: "NO_APPROVED_PRICING_CATALOG", state: "NOT_PUBLISHED" },
] as const;

export type SupplementalRoute = (typeof SUPPLEMENTAL_ROUTES)[number];