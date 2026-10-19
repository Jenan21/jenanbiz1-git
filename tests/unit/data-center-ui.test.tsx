import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/data-center", notFound: () => { throw new Error("NOT_FOUND"); } }));

import { DATA_CENTER_SECTIONS, dataCenterHref, displayDataCenterValue, findDataCenterSection, safeDataCenterSourceUrl } from "@/lib/admin/data-center-routes";
import { asRecords, dataCenterErrorMessage, dataCenterRequest } from "@/components/admin/data-center/api";
import { CommandForm, commandPayload, DATA_CENTER_COMMANDS } from "@/components/admin/data-center/command-form";
import { RecordDetails } from "@/components/admin/data-center/record-details";
import { DataCenterWorkspace, sectionQuery } from "@/components/admin/data-center/workspace";
import DataCenterSectionPage from "@/app/admin/data-center/[section]/page";
import { commandSchema } from "@/services/data-center/contracts";

afterEach(() => vi.unstubAllGlobals());

describe("Data Center navigation and truthful states", () => {
  it("has exactly fifteen distinct real sections without rewriting unrelated navigation", () => {
    expect(DATA_CENTER_SECTIONS).toHaveLength(15);
    expect(new Set(DATA_CENTER_SECTIONS.map((item) => dataCenterHref(item.key))).size).toBe(15);
    expect(dataCenterHref("overview")).toBe("/admin/data-center");
    expect(dataCenterHref("robot-knowledge")).toBe("/admin/data-center/robot-knowledge");
    expect(findDataCenterSection("unknown")).toBeNull();
    expect(findDataCenterSection("funding")).toBeNull();
  });
  it("rejects unknown child routes", async () => {
    await expect(DataCenterSectionPage({ params: Promise.resolve({ section: "unknown" }) })).rejects.toThrow("NOT_FOUND");
  });
  it("renders all sections in an RTL shell and never fabricates loading health", () => {
    for (const section of DATA_CENTER_SECTIONS) {
      const html = renderToStaticMarkup(createElement(DataCenterWorkspace, { section: section.key }));
      expect(html).toContain('dir="rtl"');
      expect(html).toContain(`data-section="${section.key}"`);
      expect(html).toContain(section.english);
      expect(html.match(/aria-current="page"/g)?.length).toBeGreaterThan(0);
      expect(html).not.toContain("سلامة النظام");
      expect(html).not.toContain("+18%");
      expect(html).not.toContain("99%");
      expect(html).not.toContain("<script");
    }
  });
  it("preserves zero without translating unavailable metrics into zero", () => {
    expect(displayDataCenterValue(0)).toBe("0");
    expect(displayDataCenterValue(null)).toBe("غير متاح");
    expect(displayDataCenterValue(undefined)).toBe("غير متاح");
    expect(displayDataCenterValue(NaN)).toBe("غير متاح");
    expect(displayDataCenterValue(false)).toBe("لا");
  });
  it("disables unverified upload and semantic capabilities rather than promising unavailable providers", () => {
    const imports = renderToStaticMarkup(createElement(DataCenterWorkspace, { section: "imports" }));
    expect(imports).toContain('type="file"');
    expect(imports).toMatch(/type="file"[^>]*disabled/);
    expect(imports).not.toContain(".txt,.md");
    const knowledge = renderToStaticMarkup(createElement(DataCenterWorkspace, { section: "robot-knowledge" }));
    expect(knowledge).toMatch(/value="semantic"[^>]*disabled/);
    expect(knowledge).toContain("بحث دلالي — غير متاح");
  });
});

describe("Data Center provenance and forms", () => {
  it("allows only HTTP(S) source links and escapes source content", () => {
    expect(safeDataCenterSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeDataCenterSourceUrl("data:text/html,unsafe")).toBeNull();
    expect(safeDataCenterSourceUrl("/relative")).toBeNull();
    expect(safeDataCenterSourceUrl("https://example.com/source")).toBe("https://example.com/source");
    const html = renderToStaticMarkup(createElement(RecordDetails, { record: {
      title: '<img src=x onerror="alert(1)">', sourceUrl: "javascript:alert(1)", referenceUrl: "https://example.com/source", confidence: 0,
      versions: [{ number: 1, provenance: [{ reference: "https://example.com" }] }],
    } }));
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("الثقة المسجلة");
    expect(html).toContain("عرض التفاصيل");
    expect(html).toContain("noopener");
  });
  it("serializes source booleans, scope and freshness without coercing false to true", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: "Source", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal", freshnessDays: "90", allowExport: "false", allowRetrieval: "true" })) form.set(key, value);
    const payload = commandPayload(form, DATA_CENTER_COMMANDS.source);
    expect(payload).toMatchObject({ action: "create-source", freshnessDays: 90, allowExport: false, allowRetrieval: true });
    expect(commandSchema.safeParse(payload).success).toBe(true);
    expect(payload).not.toHaveProperty("organizationId");
  });
  it("retains classification and separates dates, tags, provenance from raw text", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Dataset", sourceId: "s1", typeKey: "dataset", layer: "DATA", content: "Content", evidenceStatus: "UNVERIFIED", origin: "HUMAN", category: "ASSET", department: "operations", sourcePublishedAt: "2026-10-01T12:00", specialties: "finance, operations،research", provenance: '[{"label":"Official","reference":"https://example.com","kind":"SOURCE"}]' })) form.set(key, value);
    const payload = commandPayload(form, DATA_CENTER_COMMANDS.item);
    expect(payload).toMatchObject({ action: "create-item", specialties: ["finance", "operations", "research"] });
    expect(payload).not.toHaveProperty("origin");
    expect(payload).not.toHaveProperty("category");
    expect(payload).not.toHaveProperty("department");
    expect(commandSchema.safeParse(payload).success).toBe(true);
    expect(payload.sourcePublishedAt).toMatch(/^2026-10-01T/);
    expect(Array.isArray(payload.provenance)).toBe(true);
    expect(payload).not.toHaveProperty("expiresAt");
  });
  it("rejects invalid provenance JSON rather than silently dropping it", () => {
    const form = new FormData();
    form.set("provenance", "not-json");
    expect(() => commandPayload(form, DATA_CENTER_COMMANDS.item)).toThrow();
  });
  it("keeps review reasons human-entered and includes a distinct approval transition", () => {
    expect(DATA_CENTER_COMMANDS.review.fields.find((field) => field.name === "notes")?.defaultValue).toBeUndefined();
    expect(DATA_CENTER_COMMANDS.transition.fields.find((field) => field.name === "status")?.options).toContain("APPROVED");
    const html = renderToStaticMarkup(createElement(CommandForm, { definition: DATA_CENTER_COMMANDS.review, busy: true, fixed: { itemId: "i1" }, onSubmit: async () => true }));
    expect(html).toContain("disabled");
    expect(html).toContain('name="notes"');
  });
  it("includes explicit retrieval permission metadata on creation and later versions", () => {
    for (const definition of [DATA_CENTER_COMMANDS.item, DATA_CENTER_COMMANDS.version]) {
      expect(definition.fields.some((field) => field.name === "requiredPermission")).toBe(true);
      const form = new FormData();
      form.set("requiredPermission", "data-center.read.restricted");
      const payload = commandPayload(form, definition);
      expect(payload.requiredPermission).toBe("data-center.read.restricted");
    }
  });
  it("classifies types through registered category and department keys", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ key: "template", label: "Template", layer: "KNOWLEDGE", categoryKey: "assets", departmentKey: "operations", requiresIndependentReview: "true" })) form.set(key, value);
    const payload = commandPayload(form, DATA_CENTER_COMMANDS.type);
    expect(payload).toMatchObject({ action: "register-type", categoryKey: "assets", departmentKey: "operations", requiresIndependentReview: true });
    expect(commandSchema.safeParse(payload).success).toBe(true);
  });
  it("scopes data and knowledge tabs and keeps robot retrieval separate from draft lists", () => {
    expect(sectionQuery("data", 1).get("layer")).toBe("DATA");
    expect(sectionQuery("knowledge", 2).get("layer")).toBe("KNOWLEDGE");
    expect(sectionQuery("assets", 1).get("categoryKey")).toBe("assets");
    expect(sectionQuery("robot-knowledge", 1).get("area")).toBe("overview");
    expect(sectionQuery("usage", 3).get("page")).toBe("3");
  });
});

describe("Data Center request errors", () => {
  it("distinguishes permission, throttle, governance and infrastructure errors", () => {
    expect(dataCenterErrorMessage(403, null)).toContain("صلاحية");
    expect(dataCenterErrorMessage(429, null)).toContain("حد الطلبات");
    expect(dataCenterErrorMessage(409, { code: "INDEPENDENT_REVIEW_REQUIRED" })).toContain("مستقل");
    expect(dataCenterErrorMessage(503, null)).toContain("غير متاحة");
  });
  it("rejects failed HTTP and unsuccessful envelopes without supplying fake counts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ success: false }) }));
    await expect(dataCenterRequest("/api/admin/data-center")).rejects.toThrow("غير متاحة");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: false, message: "Rejected" }) }));
    await expect(dataCenterRequest("/api/admin/data-center")).rejects.toThrow("Rejected");
  });
  it("returns authentic zero values and filters invalid list entries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { items: 0 } }) }));
    expect(await dataCenterRequest("/api/admin/data-center")).toEqual({ success: true, data: { items: 0 } });
    expect(asRecords([null, 1, "text", [], { id: "1" }])).toEqual([{ id: "1" }]);
  });
});
