import { createHash } from "node:crypto";

/**
 * Jenan PRO Map backup and restore validation.
 *
 * A backup is a folder: `manifest.json`, `manifest.sha256` (the manifest's own digest), and one file per artifact stored as
 * `artifacts/<sha256>`. The manifest names every part of a release (mapVersion, dataVersion, styles, PMTiles, metadata, layer
 * configuration, source registry, runtime configuration). Restoring never touches production: `validateBackup` proves the folder
 * is complete and intact, and the files are then imported as a NEW unreviewed candidate that goes through the normal
 * Validate → Preview → Approve → Publish path.
 */

export const OWNERSHIP_CLASSES = ["JENAN_OWNED", "OPEN_LICENSE", "LICENSED", "RESTRICTED"] as const;
export type OwnershipClass = (typeof OWNERSHIP_CLASSES)[number];

const OPEN_LICENSES = /^(ODbL-1\.0|CC-BY-4\.0|CC-BY-SA-[0-9.]+|CC0-1\.0|OFL-1\.1|PDDL-1\.0|OGL-UK-3\.0)$/;

/**
 * Which class a piece of map content belongs to. The class follows the licence and who made the content, so OpenStreetMap-derived
 * tiles are never presented as Jenan's own even when Jenan built the archive; Jenan's code, styles and designs are Jenan's.
 */
export function ownershipOf(input: { license?: string | null; author?: "jenan" | "third-party" | null; restricted?: boolean }): OwnershipClass {
  if (input.restricted) return "RESTRICTED";
  const license = (input.license ?? "").trim();
  if (OPEN_LICENSES.test(license)) return "OPEN_LICENSE";
  if (input.author === "jenan" && (license === "" || /^(proprietary|jenan)/i.test(license))) return "JENAN_OWNED";
  if (license) return "LICENSED";
  return "RESTRICTED";
}

/** What may leave the platform: only content whose class and licence allow redistribution. */
export function mayRedistribute(ownership: OwnershipClass, exportAllowed: boolean) {
  return exportAllowed && ownership !== "RESTRICTED";
}

/** Whether a layer's recorded provenance lets its data leave the platform. The export gate and the admin catalog share this one rule. */
export function layerExportable(provenance: { license?: string | null } | null | undefined) {
  const license = provenance?.license ?? "";
  return mayRedistribute(ownershipOf({ license, author: null }), license.length > 0);
}

export type BackupArtifact = {
  id: string; kind: string; filename: string; mime: string; sha256: string; byteSize: number;
  publicSafe: boolean; exportAllowed: boolean; exportLicense: string | null; ownership: OwnershipClass;
};
export type BackupLayer = {
  id: string; label: string; styleLayerIds: string[]; searchCategories: string[]; confidence: number | null;
  visibility: string; status: string; provenance: unknown;
};
export type BackupInput = {
  release: { id: string; version: string; status: string; source: string; sourceDate: string; license: string; publishedAt: string | null };
  artifacts: BackupArtifact[];
  layers: BackupLayer[];
  runtime: { status: string; maintenanceMessage: string | null; publishedReleaseId: string | null; revision: number };
  sources: Array<{ name: string; url: string; license: string; ownership: OwnershipClass; attribution?: string }>;
  createdAt: string;
  createdBy: string;
};
export const BACKUP_FORMAT = "jenan-pro-map-backup-v1";

const hex = /^[a-f0-9]{64}$/;
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export function backupFileName(sha256: string) {
  if (!hex.test(sha256)) throw new Error("INVALID_CHECKSUM");
  return `artifacts/${sha256}`;
}

/** UTF-16 code-unit order, never the machine's locale, so a manifest and its digest are identical on every server. */
export const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Deterministic JSON: object keys sorted, so the same content always produces the same manifest and digest. */
export function canonicalJson(value: unknown): string {
  const sort = (input: unknown): unknown => Array.isArray(input) ? input.map(sort)
    : input && typeof input === "object" ? Object.fromEntries(Object.keys(input).sort(byCodeUnit).map((key) => [key, sort((input as Record<string, unknown>)[key])]))
      : input;
  return JSON.stringify(sort(value), null, 2) + "\n";
}

export function buildBackupManifest(input: BackupInput) {
  const kinds = new Set(input.artifacts.map((artifact) => artifact.kind));
  for (const required of ["pmtiles", "style", "schema", "coverage"]) {
    if (!kinds.has(required)) throw new Error(`BACKUP_REQUIRES_${required.toUpperCase()}`);
  }
  const manifest = {
    format: BACKUP_FORMAT,
    mapVersion: input.release.version,
    dataVersion: input.release.sourceDate,
    release: input.release,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    runtime: input.runtime,
    configuration: { layers: input.layers },
    sourceRegistry: input.sources,
    ownershipSummary: Object.fromEntries(OWNERSHIP_CLASSES.map((cls) => [cls, input.artifacts.filter((artifact) => artifact.ownership === cls).length])),
    artifacts: [...input.artifacts].sort((a, b) => byCodeUnit(a.kind, b.kind) || byCodeUnit(a.filename, b.filename))
      .map((artifact) => ({ ...artifact, file: backupFileName(artifact.sha256) })),
  };
  const text = canonicalJson(manifest);
  return { manifest, text, digest: sha(text) };
}

export type RestoreProblem = { code: string; detail: string };
/** A file inside a backup folder, described without holding it in memory (PMTiles archives are large); small files carry their bytes. */
export type BackupFile = { size: number; sha256: string; bytes?: Buffer };

/**
 * Checks a backup read from disk: format, manifest digest, every artifact present with the recorded size and checksum, no extra
 * files, and the artifacts a map needs. `files` maps a path inside the backup to its description.
 */
export function validateBackup(files: Map<string, BackupFile>, options: { requireStyleMatchesTiles?: boolean } = {}) {
  const problems: RestoreProblem[] = [];
  const fail = (code: string, detail: string) => problems.push({ code, detail });
  const manifestFile = files.get("manifest.json");
  if (!manifestFile?.bytes) return { ok: false, problems: [{ code: "MANIFEST_MISSING", detail: "manifest.json" }] };
  const recorded = files.get("manifest.sha256")?.bytes?.toString("utf8").trim();
  if (!recorded || recorded !== manifestFile.sha256) fail("MANIFEST_DIGEST_MISMATCH", "manifest.sha256 does not match manifest.json");
  let manifest: ReturnType<typeof buildBackupManifest>["manifest"];
  try { manifest = JSON.parse(manifestFile.bytes.toString("utf8")); } catch { return { ok: false, problems: [...problems, { code: "MANIFEST_INVALID", detail: "not JSON" }] }; }
  if (manifest.format !== BACKUP_FORMAT) fail("UNSUPPORTED_FORMAT", String(manifest.format));
  if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length) return { ok: false, problems: [...problems, { code: "NO_ARTIFACTS", detail: "artifacts empty" }] };
  const expected = new Set<string>(["manifest.json", "manifest.sha256"]);
  for (const artifact of manifest.artifacts) {
    if (!hex.test(artifact.sha256) || artifact.file !== `artifacts/${artifact.sha256}`) { fail("ARTIFACT_ENTRY_INVALID", artifact.filename); continue; }
    expected.add(artifact.file);
    const file = files.get(artifact.file);
    if (!file) fail("ARTIFACT_MISSING", `${artifact.kind} ${artifact.filename}`);
    else if (file.size !== artifact.byteSize) fail("ARTIFACT_SIZE_MISMATCH", `${artifact.filename}: ${file.size} != ${artifact.byteSize}`);
    else if (file.sha256 !== artifact.sha256) fail("ARTIFACT_CHECKSUM_MISMATCH", artifact.filename);
  }
  for (const name of files.keys()) if (!expected.has(name)) fail("UNEXPECTED_FILE", name);
  const kinds = new Set(manifest.artifacts.map((artifact) => artifact.kind));
  for (const required of ["pmtiles", "style", "schema", "coverage"]) if (!kinds.has(required)) fail("REQUIRED_KIND_MISSING", required);
  if (!manifest.sourceRegistry?.length) fail("SOURCE_REGISTRY_MISSING", "no sources");
  for (const source of manifest.sourceRegistry ?? []) if (!OWNERSHIP_CLASSES.includes(source.ownership)) fail("OWNERSHIP_INVALID", source.name);
  if (options.requireStyleMatchesTiles) {
    const style = manifest.artifacts.find((artifact) => artifact.kind === "style");
    const bytes = style && files.get(style.file)?.bytes;
    if (bytes) {
      try {
        const sources = Object.values(JSON.parse(bytes.toString("utf8")).sources ?? {}) as Array<{ url?: string }>;
        const tiles = manifest.artifacts.filter((artifact) => artifact.kind === "pmtiles").map((artifact) => artifact.filename);
        for (const source of sources) if (!tiles.some((name) => source.url?.endsWith(`/pmtiles/${encodeURIComponent(name)}`))) fail("STYLE_TILES_MISMATCH", String(source.url));
      } catch { fail("STYLE_INVALID", "style is not JSON"); }
    }
  }
  return { ok: problems.length === 0, problems, manifest };
}