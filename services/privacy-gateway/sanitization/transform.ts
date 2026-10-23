import type { PrivacyJob } from "../contracts";
import { parsePrivacy, privacyHash } from "../policy";
import { assertAnalytical, detectValue, parseTable, profileHash } from "./classification";
import { datasetSchema, mappingSchema, profile, SanitizationError,
  type AnalyticalKind, type SanitizedDataset, type SensitiveKind, type TokenMapping } from "./contracts";

export type ReadyArtifact = { id: string; bytes: Uint8Array };
export function emptyMapping(job: PrivacyJob): TokenMapping {
  return { contract: "jenan.privacy.mapping/v1", scope: structuredClone(job.scope), attemptId: job.attemptId,
    fence: job.fence, expiresAt: job.rawExpiresAt, taint: "RAW", entries: [] };
}
export function sanitizeTables(job: PrivacyJob, artifacts: ReadyArtifact[], oldMapping: TokenMapping, id: () => string) {
  const mapping = parsePrivacy(mappingSchema, oldMapping);
  if (privacyHash(mapping.scope) !== privacyHash(job.scope) || mapping.attemptId !== job.attemptId ||
    mapping.fence !== job.fence || mapping.expiresAt !== job.rawExpiresAt) throw new SanitizationError("TOKEN_SCOPE_MISMATCH");
  const rows: SanitizedDataset["rows"] = [];
  if (!artifacts.length || new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) throw new SanitizationError("INCOMPLETE_COVERAGE");
  if (artifacts.reduce((total, artifact) => total + artifact.bytes.length, 0) > profile.maxBytes) throw new SanitizationError("RESOURCE_LIMIT");
  let cells = 0;
  for (const artifact of artifacts) {
    const table = parseTable(artifact.bytes);
    for (const [r, source] of table.rows.entries()) {
      const row: SanitizedDataset["rows"][number] = { artifactId: artifact.id, row: r + 1, values: {}, links: [] };
      for (const [index, field] of table.fields.entries()) {
        if (++cells > profile.maxCells) throw new SanitizationError("RESOURCE_LIMIT");
        const original = source[index];
        if (field.action === "KEEP") {
          const kind = field.kind as AnalyticalKind; assertAnalytical(kind, original); row.values[kind] = original;
        } else if (field.action === "TOKENIZE") {
          if (!original || original.length > 256 || detectValue(original).includes("EMBEDDED")) throw new SanitizationError("AMBIGUOUS_VALUE");
          const kind = field.kind as SensitiveKind;
          let token = mapping.entries.find((entry) => entry.kind === kind && entry.original === original)?.token;
          if (!token) {
            token = `tok_${id()}`;
            if (mapping.entries.some((entry) => entry.token === token)) throw new SanitizationError("TOKEN_SCOPE_MISMATCH");
            mapping.entries.push({ kind, original, token });
          }
          row.links.push({ kind, token });
        }
      }
      rows.push(row);
      if (rows.length > profile.maxRows) throw new SanitizationError("RESOURCE_LIMIT");
    }
  }
  const dataset = parsePrivacy(datasetSchema, {
    contract: "jenan.privacy.dataset/v1", scope: job.scope, attemptId: job.attemptId, fence: job.fence, pins: job.pins,
    profileHash: profileHash(), anonymous: false, format: "ALLOWLIST_STRUCTURED_DATA", rows,
  });
  return { dataset, mapping: parsePrivacy(mappingSchema, mapping) };
}
