import { parsePrivacy, privacyHash, samePrivacyValue } from "../policy";
import { validatePrivacyJob } from "../states";
import { receiptPayload } from "../sanitization/service";
import type { ReceiptSigner } from "../sanitization/contracts";
import { datasetSchema, evidenceSchema, type EnrollBundle } from "./contracts";

/** Signature verification is independent of the mutable runtime/worker instance. */
export async function authenticateM3(bundle: EnrollBundle, signer: ReceiptSigner) {
  const job = validatePrivacyJob(bundle.job);
  const evidence = parsePrivacy(evidenceSchema, bundle.evidence);
  const dataset = parsePrivacy(datasetSchema, bundle.dataset);
  if (!job.verification || !job.artifact || !samePrivacyValue(job.verification, bundle.receipt) ||
    privacyHash(dataset) !== job.artifact.contentHash || !samePrivacyValue(dataset.scope, job.scope) ||
    evidence.profileHash !== dataset.profileHash || evidence.rows !== dataset.rows.length ||
    evidence.artifacts !== evidence.artifactIds.length ||
    new Set(evidence.artifactIds).size !== evidence.artifacts ||
    !dataset.rows.every((row) => evidence.artifactIds.includes(row.artifactId))) return false;
  const { signature, ...unsigned } = bundle.receipt;
  return signer.verify(receiptPayload(unsigned, evidence), signature);
}
