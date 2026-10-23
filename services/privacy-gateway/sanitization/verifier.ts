import type { PrivacyJob } from "../contracts";
import { parsePrivacy, samePrivacyValue } from "../policy";
import { assertAnalytical, detectValue, parseTable, profileHash } from "./classification";
import { datasetSchema, evidenceSchema, mappingSchema, profile, SanitizationError, type AnalyticalKind,
  type SanitizedDataset, type SensitiveKind, type VerificationEvidence } from "./contracts";
import type { ReadyArtifact } from "./transform";

export function verifyTables(job: PrivacyJob, artifacts: ReadyArtifact[], rawDataset: unknown, rawMapping: unknown): VerificationEvidence {
  const dataset = parsePrivacy(datasetSchema, rawDataset); const mapping = parsePrivacy(mappingSchema, rawMapping);
  if (!samePrivacyValue(dataset.scope, job.scope) || !samePrivacyValue(mapping.scope, job.scope) ||
    mapping.attemptId !== job.attemptId || mapping.fence !== job.fence || mapping.expiresAt !== job.rawExpiresAt) {
    throw new SanitizationError("TOKEN_SCOPE_MISMATCH");
  }
  if (dataset.attemptId !== job.attemptId || dataset.fence !== job.fence) throw new SanitizationError("STALE_ATTEMPT");
  if (!samePrivacyValue(dataset.pins, job.pins) || dataset.profileHash !== profileHash()) throw new SanitizationError("POLICY_MISMATCH");
  if (new Set(mapping.entries.map((entry) => entry.token)).size !== mapping.entries.length ||
    new Set(mapping.entries.map((entry) => JSON.stringify([entry.kind, entry.original]))).size !== mapping.entries.length) throw new SanitizationError("TOKEN_SCOPE_MISMATCH");
  if (!artifacts.length || new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) throw new SanitizationError("INCOMPLETE_COVERAGE");
  if (artifacts.reduce((total, artifact) => total + artifact.bytes.length, 0) > profile.maxBytes) throw new SanitizationError("RESOURCE_LIMIT");
  const expected: SanitizedDataset["rows"] = []; let preservedCells = 0;
  let totalCells = 0;
  const usedTokens = new Set<string>();
  for (const artifact of artifacts) {
    const table = parseTable(artifact.bytes);
    for (const [r, source] of table.rows.entries()) {
      const row: SanitizedDataset["rows"][number] = { artifactId: artifact.id, row: r + 1, values: {}, links: [] };
      for (const [i, field] of table.fields.entries()) {
        if (++totalCells > profile.maxCells) throw new SanitizationError("RESOURCE_LIMIT");
        const original = source[i];
        if (field.action === "KEEP") {
          const kind = field.kind as AnalyticalKind;
          assertAnalytical(kind, original); row.values[kind] = original; preservedCells++;
        } else if (field.action === "TOKENIZE") {
          const kind = field.kind as SensitiveKind;
          const entry = mapping.entries.find((item) => item.kind === kind && item.original === original);
          if (!entry) throw new SanitizationError("TOKEN_SCOPE_MISMATCH");
          usedTokens.add(entry.token); row.links.push({ kind, token: entry.token });
        }
      }
      expected.push(row);
      if (expected.length > profile.maxRows) throw new SanitizationError("RESOURCE_LIMIT");
    }
  }
  if (dataset.rows.length !== expected.length) throw new SanitizationError("INCOMPLETE_COVERAGE");
  if (!samePrivacyValue(expected, dataset.rows)) throw new SanitizationError("EXACT_PRESERVATION_FAILED");
  if (mapping.entries.some((entry) => !usedTokens.has(entry.token))) throw new SanitizationError("TOKEN_SCOPE_MISMATCH");
  for (const row of dataset.rows) {
    for (const [kind, value] of Object.entries(row.values)) {
      // Re-scan output, then revalidate the exact analytical type. Date/decimal forms are contextual, not identities.
      if (detectValue(value).some((finding) => ["EMAIL", "IBAN", "EMBEDDED"].includes(finding))) throw new SanitizationError("SENSITIVE_RESIDUE");
      assertAnalytical(kind as AnalyticalKind, value);
      if (mapping.entries.some((entry) => entry.original === value)) throw new SanitizationError("SENSITIVE_RESIDUE");
    }
  }
  // Conservative supported-profile checks; not a population-wide anonymization claim.
  const groups = new Map<string, number>(); const tokenCounts = new Map<string, number>();
  for (const row of dataset.rows) {
    const quasi = JSON.stringify([row.values, row.links.map((link) => link.kind)]);
    groups.set(quasi, (groups.get(quasi) ?? 0) + 1);
    for (const link of row.links) tokenCounts.set(link.token, (tokenCounts.get(link.token) ?? 0) + 1);
  }
  if ([...groups.values()].some((count) => count < profile.minCohort)) throw new SanitizationError("QUASI_IDENTIFIER_COMBINATION");
  if ([...tokenCounts.values()].some((count) => count < profile.minCohort)) throw new SanitizationError("RARE_TOKEN_LINK");
  return parsePrivacy(evidenceSchema, {
    contract: "jenan.privacy.verification-evidence/v1", result: "SANITIZATION_VERIFIED", profileHash: profileHash(),
    artifactIds: artifacts.map((artifact) => artifact.id), artifacts: artifacts.length, rows: expected.length, preservedCells,
    coverage: "ALL_ELIGIBLE_CSV_FIELDS", fidelity: "EXACT_STRINGS_ORDER_ASSOCIATION",
    residualCheck: "SUPPORTED_STRUCTURED_PROFILE_ONLY", anonymous: false,
  });
}
