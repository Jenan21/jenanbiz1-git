import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveTool, stripRecordSeparator } from "../../scripts/jenan-map/prepare-open-data.mjs";

describe("operator tool resolution (no PATH search)", () => {
  const dir = path.resolve("/opt/jenan-tools");

  it("uses only the configured absolute directory when one is given", () => {
    const seen: string[] = [];
    const found = resolveTool("osmium", { JENAN_MAP_TOOLS_DIR: dir }, (candidate) => {
      seen.push(candidate);
      return candidate === path.join(dir, "osmium") || candidate === path.join(dir, "osmium.exe");
    });
    expect(found.startsWith(dir)).toBe(true);
    expect(seen.every((candidate) => candidate.startsWith(dir))).toBe(true);
  });

  it("falls back to fixed system directories and never consults PATH", () => {
    const seen: string[] = [];
    expect(() => resolveTool("tippecanoe", { PATH: "/tmp/attacker" }, (candidate) => { seen.push(candidate); return false; })).toThrow(/not found/);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((candidate) => candidate.includes("attacker"))).toBe(false);
  });

  it("rejects a relative tools directory and unsafe tool names", () => {
    expect(() => resolveTool("osmium", { JENAN_MAP_TOOLS_DIR: "relative/bin" }, () => true)).toThrow(/absolute/);
    for (const name of ["../osmium", "osmium; rm", "OSMIUM", ""]) expect(() => resolveTool(name, {}, () => true)).toThrow(/Invalid/);
  });
});

describe("GeoJSON text sequence records", () => {
  it("removes only a leading record separator", () => {
    const separator = String.fromCharCode(0x1e);
    expect(stripRecordSeparator(`${separator}{"type":"Feature"}`)).toBe('{"type":"Feature"}');
    expect(stripRecordSeparator('{"type":"Feature"}')).toBe('{"type":"Feature"}');
    expect(stripRecordSeparator(`{"a":"${separator}"}`)).toBe(`{"a":"${separator}"}`);
  });
});
