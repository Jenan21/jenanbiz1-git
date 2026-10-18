import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { buildBackupManifest, canonicalJson, mayRedistribute, ownershipOf, validateBackup, type BackupArtifact, type BackupInput } from "@/services/jenan-map/backup";
import { validateBackupDirectory, writeBackup } from "@/services/jenan-map/backup-files";

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const bytesOf: Record<string, Buffer> = {
  pmtiles: Buffer.from("PMTiles-fixture-bytes"), style: Buffer.from('{"version":8,"sources":{"saudi":{"type":"vector","url":"pmtiles:///api/jenan-map/releases/r/pmtiles/saudi.pmtiles"}},"layers":[]}'),
  schema: Buffer.from('{"version":"v1","vector_layers":[{"id":"places"}]}'), coverage: Buffer.from('{"countryCode":"SA"}'),
};
const artifact = (kind: string, filename: string, extra: Partial<BackupArtifact> = {}): BackupArtifact => ({
  id: `id-${kind}`, kind, filename, mime: "application/octet-stream", sha256: sha(bytesOf[kind]), byteSize: bytesOf[kind].length,
  publicSafe: kind !== "schema" && kind !== "coverage", exportAllowed: true, exportLicense: "ODbL-1.0", ownership: "OPEN_LICENSE", ...extra,
});
const input = (): BackupInput => ({
  release: { id: "r", version: "2026.10.17", status: "Published", source: "Protomaps/OSM", sourceDate: "2026-10-17T04:00:00.000Z", license: "ODbL-1.0", publishedAt: "2026-10-18T00:00:00.000Z" },
  artifacts: [artifact("pmtiles", "saudi.pmtiles"), artifact("style", "style.json", { ownership: "JENAN_OWNED", exportLicense: null }), artifact("schema", "schema.json"), artifact("coverage", "coverage.json")],
  layers: [{ id: "roads", label: "الطرق", styleLayerIds: ["roads-major"], searchCategories: ["roads"], confidence: null, visibility: "public", status: "ready", provenance: { license: "ODbL-1.0" } }],
  runtime: { status: "enabled", maintenanceMessage: null, publishedReleaseId: "r", revision: 4 },
  sources: [{ name: "OpenStreetMap", url: "https://www.openstreetmap.org", license: "ODbL-1.0", ownership: "OPEN_LICENSE" }, { name: "Jenan styles", url: "https://jenanpro.sa", license: "", ownership: "JENAN_OWNED" }],
  createdAt: "2026-10-18T07:00:00.000Z", createdBy: "admin-1",
});
const open = async (a: BackupArtifact) => Readable.from([bytesOf[a.kind]]);

describe("ownership classes", () => {
  it("never calls OpenStreetMap-derived data Jenan's own", () => {
    expect(ownershipOf({ license: "ODbL-1.0", author: "jenan" })).toBe("OPEN_LICENSE");
    expect(ownershipOf({ license: "CC-BY-4.0" })).toBe("OPEN_LICENSE");
    expect(ownershipOf({ license: "OFL-1.1" })).toBe("OPEN_LICENSE");
  });
  it("keeps Jenan's own code, styles and collected data separate", () => {
    expect(ownershipOf({ license: "", author: "jenan" })).toBe("JENAN_OWNED");
    expect(ownershipOf({ license: "Proprietary - Jenan PRO", author: "jenan" })).toBe("JENAN_OWNED");
  });
  it("separates purchased licences from restricted third-party data", () => {
    expect(ownershipOf({ license: "Commercial agreement 2026-04", author: "third-party" })).toBe("LICENSED");
    expect(ownershipOf({ license: "anything", restricted: true })).toBe("RESTRICTED");
    expect(ownershipOf({})).toBe("RESTRICTED");
  });
  it("lets restricted data stay inside even when marked exportable", () => {
    expect(mayRedistribute("RESTRICTED", true)).toBe(false);
    expect(mayRedistribute("OPEN_LICENSE", false)).toBe(false);
    expect(mayRedistribute("OPEN_LICENSE", true)).toBe(true);
  });
});

describe("backup manifest", () => {
  it("is deterministic and records version, data version, configuration, sources and checksums", () => {
    const a = buildBackupManifest(input()), b = buildBackupManifest({ ...input(), artifacts: [...input().artifacts].reverse() });
    expect(a.digest).toBe(b.digest);
    expect(a.manifest).toMatchObject({ format: "jenan-pro-map-backup-v1", mapVersion: "2026.10.17", dataVersion: "2026-10-17T04:00:00.000Z",
      ownershipSummary: { OPEN_LICENSE: 3, JENAN_OWNED: 1, LICENSED: 0, RESTRICTED: 0 }, runtime: { revision: 4 } });
    expect(a.manifest.configuration.layers[0].id).toBe("roads");
    expect(a.manifest.artifacts.every((item) => item.file === `artifacts/${item.sha256}`)).toBe(true);
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: 1 }, b: 1 }));
  });
  it("orders keys by code unit, never by the machine's locale", () => {
    expect(Object.keys(JSON.parse(canonicalJson({ b: 1, B: 2, "ä": 3, a: 4, Z: 5 })))).toEqual(["B", "Z", "a", "b", "ä"]);
  });
  it.each(["pmtiles", "style", "schema", "coverage"])("refuses a backup without %s", (kind) => {
    expect(() => buildBackupManifest({ ...input(), artifacts: input().artifacts.filter((item) => item.kind !== kind) })).toThrow(/BACKUP_REQUIRES/);
  });
});

describe("restore validation (folder on disk)", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "jenan-backup-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); await rm(`${dir}-x`, { recursive: true, force: true }); });

  it("writes a full backup and validates it, including that the style points at the backed-up tiles", async () => {
    const out = path.join(dir, "backup");
    const written = await writeBackup(out, input(), open);
    expect(written.artifacts).toBe(4);
    expect(await readFile(path.join(out, "manifest.sha256"), "utf8")).toBe(written.digest + "\n");
    const verdict = await validateBackupDirectory(out, { requireStyleMatchesTiles: true });
    expect(verdict).toMatchObject({ ok: true, problems: [] });
  });
  it("never writes into an existing folder", async () => {
    const out = path.join(dir, "backup");
    await mkdir(out);
    await expect(writeBackup(out, input(), open)).rejects.toThrow("BACKUP_FOLDER_EXISTS");
  });
  it("stores identical bytes once and keeps private source evidence in the backup", async () => {
    const out = path.join(dir, "backup");
    bytesOf.source = Buffer.from('{"type":"Feature"}');
    try {
      const withSource = { ...input(), artifacts: [...input().artifacts,
        artifact("source", "boundary-source.bin", { publicSafe: false, exportAllowed: false, exportLicense: null }),
        artifact("source", "boundary-copy.bin", { id: "id-source-2", publicSafe: false, exportAllowed: false, exportLicense: null })] };
      const written = await writeBackup(out, withSource, open);
      expect(written.artifacts).toBe(6);
      expect(readdirSync(path.join(out, "artifacts")).sort()).toEqual([sha(bytesOf.coverage), sha(bytesOf.pmtiles), sha(bytesOf.schema), sha(bytesOf.source), sha(bytesOf.style)].sort());
      expect(await validateBackupDirectory(out)).toMatchObject({ ok: true, problems: [] });
    } finally { delete bytesOf.source; }
  });
  it("detects a flipped byte, a missing file, a truncated file, an extra file and a tampered manifest", async () => {
    const out = path.join(dir, "backup");
    await writeBackup(out, input(), open);
    const tile = path.join(out, "artifacts", sha(bytesOf.pmtiles));
    await writeFile(tile, Buffer.from("PMTiles-fixture-bytez"));
    expect((await validateBackupDirectory(out)).problems.map((p) => p.code)).toContain("ARTIFACT_CHECKSUM_MISMATCH");
    await writeFile(tile, Buffer.from("short"));
    expect((await validateBackupDirectory(out)).problems.map((p) => p.code)).toContain("ARTIFACT_SIZE_MISMATCH");
    await rm(tile);
    expect((await validateBackupDirectory(out)).problems.map((p) => p.code)).toContain("ARTIFACT_MISSING");
    await writeFile(path.join(out, "artifacts", "extra"), "x");
    expect((await validateBackupDirectory(out)).problems.map((p) => p.code)).toContain("UNEXPECTED_FILE");
    const manifest = JSON.parse(await readFile(path.join(out, "manifest.json"), "utf8"));
    manifest.mapVersion = "tampered";
    await writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest));
    expect((await validateBackupDirectory(out)).problems.map((p) => p.code)).toContain("MANIFEST_DIGEST_MISMATCH");
  });
  it("cleans up and reports when an artifact changes while it is being backed up", async () => {
    const out = path.join(dir, "backup");
    await expect(writeBackup(out, input(), async (a) => Readable.from([a.kind === "pmtiles" ? Buffer.from("different") : bytesOf[a.kind]]))).rejects.toThrow(/BACKUP_ARTIFACT_CHANGED/);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.partial`)).toBe(false);
  });
  it("rejects wrong formats, an empty manifest and a missing source registry", () => {
    const built = buildBackupManifest(input());
    const files = (manifest: unknown) => { const text = Buffer.from(JSON.stringify(manifest)); return new Map([["manifest.json", { size: text.length, sha256: sha(text), bytes: text }], ["manifest.sha256", { size: 65, sha256: "", bytes: Buffer.from(sha(text)) }]]); };
    expect(validateBackup(files({ ...built.manifest, format: "other" })).problems.map((p) => p.code)).toContain("UNSUPPORTED_FORMAT");
    expect(validateBackup(files({ ...built.manifest, artifacts: [] })).problems.map((p) => p.code)).toContain("NO_ARTIFACTS");
    expect(validateBackup(files({ ...built.manifest, sourceRegistry: [] })).problems.map((p) => p.code)).toContain("SOURCE_REGISTRY_MISSING");
    expect(validateBackup(new Map()).problems[0].code).toBe("MANIFEST_MISSING");
  });
});

// Real data: backs up and validates the actual Saudi archive when it exists on this machine (about 1 GB, runs once).
const realDir = path.resolve(".jenan-map-data/saudi");
const realFile = existsSync(realDir) ? readdirSync(realDir).find((n) => /^saudi-\d{8}-z\d+\.pmtiles$/.test(n)) : undefined;
describe.skipIf(!realFile || process.env.JENAN_MAP_REAL_BACKUP !== "1")("full backup of the real Saudi PMTiles", () => {
  it("backs the real archive up and the backup validates", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "jenan-real-backup-"));
    try {
      const manifest = JSON.parse(await readFile(path.join(realDir, `${realFile}.manifest.json`), "utf8"));
      const tiles: BackupArtifact = { id: "real", kind: "pmtiles", filename: String(realFile), mime: "application/vnd.pmtiles", sha256: manifest.sha256, byteSize: manifest.byteSize,
        publicSafe: true, exportAllowed: true, exportLicense: manifest.source.license, ownership: "OPEN_LICENSE" };
      const base = input();
      const merged = { ...base, artifacts: [tiles, ...base.artifacts.filter((a) => a.kind !== "pmtiles")] };
      const out = path.join(dir, "backup");
      await writeBackup(out, merged, async (a) => a.kind === "pmtiles" ? createReadStream(path.join(realDir, String(realFile))) : Readable.from([bytesOf[a.kind]]));
      expect(await validateBackupDirectory(out)).toMatchObject({ ok: true });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 600_000);
});
