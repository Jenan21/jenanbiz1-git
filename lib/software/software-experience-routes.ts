export const SOFTWARE_EXPERIENCE_ROUTES = [
  { id: "portal", route: "/software", kind: "portal" },
  { id: "files", route: "/software/files", kind: "files" },
  { id: "images-to-pdf", route: "/software/files/images-to-pdf", kind: "images-to-pdf" },
  { id: "merge-pdf", route: "/software/files/merge-pdf", kind: "pdf-tool", tool: "merge" },
  { id: "split-pdf", route: "/software/files/split-pdf", kind: "pdf-tool", tool: "split" },
  { id: "compress-pdf", route: "/software/files/compress-pdf", kind: "pdf-tool", tool: "compress" },
  { id: "word-to-pdf", route: "/software/files/word-to-pdf", kind: "conversion", action: "docxToPdf" },
  { id: "pdf-to-word", route: "/software/files/pdf-to-word", kind: "conversion", action: "pdfToDocx" },
  { id: "pdf-to-excel", route: "/software/files/pdf-to-excel", kind: "conversion", action: "pdfToXlsx" },
  { id: "excel-to-pdf", route: "/software/files/excel-to-pdf", kind: "conversion", action: "xlsxToPdf" },
  { id: "design", route: "/software/design", kind: "design" },
  { id: "design-logo", route: "/software/design/logo", kind: "design-editor", studioId: "logo" },
  { id: "design-letterhead", route: "/software/design/letterhead", kind: "design-editor", studioId: "letterhead" },
  { id: "design-cv", route: "/software/design/cv", kind: "design-editor", studioId: "cv" },
  { id: "design-docs", route: "/software/design/docs", kind: "design-editor", studioId: "docs" },
  { id: "design-sheets", route: "/software/design/sheets", kind: "design-editor", studioId: "sheets" },
  { id: "design-presentations", route: "/software/design/presentations", kind: "design-editor", studioId: "presentations" },
  { id: "design-history", route: "/software/design/history", kind: "design-editor", studioId: "history" },
] as const;

export type SoftwareExperienceRoute = (typeof SOFTWARE_EXPERIENCE_ROUTES)[number];
export type SoftwareExperienceRouteId = SoftwareExperienceRoute["id"];

export function resolveSoftwareExperienceFlow(flow: string[]) {
  const route = `/software/${flow.join("/")}`;
  return SOFTWARE_EXPERIENCE_ROUTES.find((definition) => definition.route === route) ?? null;
}
