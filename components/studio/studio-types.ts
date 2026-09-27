export type StudioDocumentKind = "DOCS" | "SHEETS" | "PRESENTATION" | "LOGO" | "LETTERHEAD" | "CV";

export type StudioVersion = {
  id: string;
  version: number;
  title: string;
  content: Record<string, unknown>;
  createdAt: string;
};

export type StudioDocumentRecord = {
  id: string;
  kind: StudioDocumentKind;
  title: string;
  content: Record<string, unknown>;
  currentVersion: number;
  versions: StudioVersion[];
  createdAt: string;
  updatedAt: string;
};

export type StudioActivity = {
  id: string;
  action: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export const STUDIO_KIND_ROUTES: Record<StudioDocumentKind, string> = {
  DOCS: "/studio/docs",
  SHEETS: "/studio/sheets",
  PRESENTATION: "/studio/presentations",
  LOGO: "/studio/logo",
  LETTERHEAD: "/studio/letterhead",
  CV: "/studio/cv",
};

export const STUDIO_ROUTE_KINDS: Partial<Record<string, StudioDocumentKind>> = {
  docs: "DOCS",
  sheets: "SHEETS",
  presentations: "PRESENTATION",
  logo: "LOGO",
  letterhead: "LETTERHEAD",
  cv: "CV",
};

export function createBlankStudioContent(kind: StudioDocumentKind): Record<string, unknown> {
  if (kind === "DOCS") return { body: "", template: "blank" };
  if (kind === "SHEETS") return { rows: [["Item", "Value", "Owner", "Status"], ["", "", "", ""], ["", "", "", ""]] };
  if (kind === "PRESENTATION") return { slides: [{ title: "", body: "" }], selectedSlide: 0 };
  if (kind === "LOGO") return { name: "", tagline: "", initials: "", primary: "#16d9c5", accent: "#f4c86a", style: "geometric" };
  if (kind === "LETTERHEAD") return { company: "", address: "", contact: "", footer: "", accent: "#16d9c5" };
  return { name: "", role: "", summary: "", experience: "", education: "", skills: "", accent: "#16d9c5" };
}