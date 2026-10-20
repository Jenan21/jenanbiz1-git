import { assessMapBinding, mapBindingSchema, mapReferenceSchema, type DataCenterMapBinding, type DataCenterMapReference, type MapFinding } from "@/services/data-center/map-contract";
import { compareText } from "../shared/canonical";
import type { EngineInput } from "../shared/contracts";
import { EngineError } from "../shared/errors";
import { createGap, type Gap } from "../shared/gaps";
import { buildDataCenterInput } from "./data-center-inputs";
import { DataCenterProviderError, type SpatialDataCenterPort } from "./data-center-port";
import { spatialGapCatalog } from "./gaps";

/**
 * Reconciles a Map layer with the Data Center version its release is bound to. The two systems keep to what each is the source of truth for,
 * and nothing links them but a version id and the snapshot the Data Center's own Map contract defines (`DataCenterMapBinding`; no foreign key
 * and no query crosses between the two schemas):
 *
 *  - the Data Center states the rights, ownership, source, attribution, quality, evidence and freshness of the data, as it does now (the
 *    snapshot the release kept is only compared with it, never used in its place);
 *  - the Map states the artifact and its geometry: the identity of the layer, its published artifact (and that artifact's digest), and
 *    where the Map says it applies when the Data Center declares no coverage.
 *
 * A binding can only enrich a layer or take its registration away; it never makes a layer registered. A layer that says it is bound to the
 * Data Center and cannot show it (the binding is malformed, is for another layer, names a version that is not available, no longer agrees
 * with the Data Center in a way that matters, or the Data Center could not be asked) is treated as unregistered, never guessed at.
 */
export const mapBindingRefusals = ["BINDING_INVALID", "BINDING_FOR_ANOTHER_LAYER", "VERSION_UNAVAILABLE", "INCONSISTENT", "BACKEND_UNAVAILABLE"] as const;
export type MapBindingRefusal = typeof mapBindingRefusals[number];

export type MapBindingOutcome =
  | { status: "RECONCILED"; binding: DataCenterMapBinding; reference: DataCenterMapReference; findings: MapFinding[] }
  | { status: "NOT_REGISTERED"; refusal: MapBindingRefusal; findings: MapFinding[] };

/** Where the binding was found: a binding kept for another layer or release is never accepted for this one. */
export interface MapLayerAddress { releaseId: string; layerKey: string }

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

export async function reconcileMapBinding(args: { binding: unknown; layer: MapLayerAddress; port: Pick<SpatialDataCenterPort, "resolveMapReference"> }): Promise<MapBindingOutcome> {
  const refused = (refusal: MapBindingRefusal, findings: MapFinding[] = []): MapBindingOutcome => ({ status: "NOT_REGISTERED", refusal, findings });
  const parsed = mapBindingSchema.safeParse(args.binding);
  if (!parsed.success) return refused("BINDING_INVALID");
  const binding = parsed.data;
  if (binding.map.releaseId !== args.layer.releaseId || binding.map.layerKey !== args.layer.layerKey) return refused("BINDING_FOR_ANOTHER_LAYER");

  let current: DataCenterMapReference | null;
  try {
    current = await args.port.resolveMapReference(binding.reference.version.versionId);
  } catch (error) {
    if (error instanceof DataCenterProviderError) return refused("BACKEND_UNAVAILABLE");
    throw error;
  }
  if (current === null) return refused("VERSION_UNAVAILABLE", assessMapBinding(binding, null).findings);
  // Whatever answered, it must speak the Data Center's contract: anything else is not an answer.
  if (!mapReferenceSchema.safeParse(current).success) return refused("BACKEND_UNAVAILABLE");
  const assessment = assessMapBinding(binding, current);
  return assessment.consistent ? { status: "RECONCILED", binding, reference: current, findings: assessment.findings } : refused("INCONSISTENT", assessment.findings);
}

const codesOf = (findings: readonly MapFinding[]) => findings.map((finding) => finding.code).filter((code) => CODE.test(code));

/**
 * The layer's input after reconciliation, and the gaps that say what happened. The layer is the one the Map described (its id, its
 * reference, its registration at most unchanged); a reconciled binding gives it the Data Center's current statements, a refused one makes it
 * unregistered.
 */
export function applyMapBinding(layer: EngineInput, outcome: MapBindingOutcome, evaluatedAt: string): { input: EngineInput; gaps: Gap[] } {
  if (layer.kind !== "MAP_LAYER") throw new EngineError("CONTRACT_VIOLATION", { reason: "map_binding_needs_a_map_layer" });
  const dataset = layer.ref.label;

  if (outcome.status === "NOT_REGISTERED") {
    const blocking = codesOf(outcome.findings.filter((finding) => finding.blocking));
    const reason = blocking.length === 0 ? outcome.refusal : `${outcome.refusal}: ${blocking.join(", ")}`;
    return { input: { ...layer, governance: "MAP_UNREGISTERED" }, gaps: [createGap(spatialGapCatalog, "MAP_DATA_CENTER_BINDING_REFUSED", { dataset, reason }, { inputId: layer.id })] };
  }

  const { binding, reference } = outcome;
  const statements = buildDataCenterInput({ reference, roles: layer.roles, evaluatedAt });
  // The digest of the Map's published artifact, which is not the digest of the Data Center version's content.
  const artifact = binding.map.artifactSha256 === undefined ? layer.checksum : { algorithm: "SHA-256" as const, value: binding.map.artifactSha256 };
  const limitations = new Set(statements.limitations);
  limitations.add(clip(
    `Rights, ownership, source, attribution, quality and freshness are those the Data Center states for version ${reference.version.versionId} (SHA-256 ${reference.version.checksum.value.slice(0, 12)}…), `
    + `to which Map release ${binding.map.releaseId} is bound; the artifact and its geometry are the Map's.`, 500,
  ));
  if (artifact === null) limitations.add("The Map records no checksum of the published artifact for this layer.");

  const input: EngineInput = {
    ...statements,
    id: layer.id, roles: layer.roles, kind: "MAP_LAYER", governance: layer.governance, ref: layer.ref, checksum: artifact,
    // Where the data applies is the Data Center's declared coverage; the Map's own extent stands only when the Data Center declares none.
    coverage: statements.coverage ?? layer.coverage,
    limitations: [...limitations].sort(compareText),
  };
  const changes = codesOf(outcome.findings);
  const gaps = changes.length === 0 ? [] : [createGap(spatialGapCatalog, "MAP_DATA_CENTER_BINDING_CHANGED", { dataset, changes: changes.join(", ") }, { inputId: layer.id })];
  return { input, gaps };
}
