import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapArtifactImport, prepareArtifactImport } from "./artifact-import";
import type { AdminMapSnapshot } from "./snapshot";

function data() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    releaseId: "38b29b7a-4807-45ef-bf4e-9204b4987400", kind: "pmtiles",
    filename: "saudi.pmtiles", sha256: "a".repeat(64), byteSize: "4",
    confirmation: "IMPORT OWNED MAP ARTIFACT", acknowledged: "on", stagedFilename: "owned.pmtiles",
  })) form.set(key, value);
  return form;
}

describe("real administrative artifact import", () => {
  it("sends the documented staged contract with explicit checksum, size and private defaults", () => {
    const request = prepareArtifactImport(data(), "staged");
    expect(request.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(request.body as string)).toEqual({
      stagedFilename: "owned.pmtiles",
      metadata: { kind: "pmtiles", filename: "saudi.pmtiles", sha256: "a".repeat(64), byteSize: 4, publicSafe: false, exportAllowed: false, confirmation: "IMPORT OWNED MAP ARTIFACT" },
    });
  });

  it("sends real local file bytes rather than a synthetic upload or arbitrary URL", async () => {
    const form = data();
    form.set("file", new File(["PMT3"], "saudi.pmtiles"));
    const request = prepareArtifactImport(form, "upload");
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.headers).toBeUndefined();
    expect(await ((request.body as FormData).get("file") as File).text()).toBe("PMT3");
    expect(JSON.parse(String((request.body as FormData).get("metadata"))).byteSize).toBe(4);
  });

  it("fails closed on missing confirmation, checksum/size mismatch, paths and export permission", () => {
    for (const [key, value] of [
      ["confirmation", ""], ["acknowledged", ""], ["sha256", "bad"], ["byteSize", "0"],
      ["stagedFilename", "../secret.pmtiles"], ["stagedFilename", "https://example.com/map.pmtiles"],
      ["exportAllowed", "on"],
    ]) {
      const form = data();
      form.set(key, value);
      expect(() => prepareArtifactImport(form, "staged")).toThrow();
    }
    const form = data();
    form.set("file", new File(["mismatch"], "saudi.pmtiles"));
    expect(() => prepareArtifactImport(form, "upload")).toThrow("مطابقاً");
  });

  it("keeps validation evidence private and retains explicitly licensed export conditions", () => {
    const form = data();
    form.set("kind", "coverage");
    form.set("publicSafe", "on");
    expect(() => prepareArtifactImport(form, "staged")).toThrow("خاصة");
    form.delete("publicSafe");
    form.set("exportAllowed", "on");
    form.set("exportLicense", "Fixture-only permission");
    expect(JSON.parse(prepareArtifactImport(form, "staged").body as string).metadata.exportLicense).toBe("Fixture-only permission");
  });

  it("disables import until the server advertises capability and an eligible release", () => {
    const snapshot: AdminMapSnapshot = {
      runtime: { status: "disabled", publishedReleaseId: null, revision: 0 },
      releases: [], audit: [], blockers: [], capabilities: [],
    };
    const html = renderToStaticMarkup(<MapArtifactImport snapshot={snapshot} disabled={false} onSettled={async () => undefined} />);
    expect(html).toContain("استيراد الملفات غير متاح من الخادم");
    expect(html).toContain("<fieldset disabled");
    expect(html).toContain('pattern="IMPORT OWNED MAP ARTIFACT"');
    expect(html).not.toContain('action="https:');
  });
});
