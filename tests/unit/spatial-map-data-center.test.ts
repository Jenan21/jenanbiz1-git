import { describe, expect, it } from "vitest";
import { deriveInputGaps, deriveRights, engineInputSchema, gapSchema, type EngineError } from "@/services/analysis-engines/shared";
import { DataCenterProviderError } from "@/services/analysis-engines/spatial/data-center-port";
import { applyMapBinding, mapBindingRefusals, reconcileMapBinding } from "@/services/analysis-engines/spatial/map-data-center";
import { buildMapLayerInput } from "@/services/analysis-engines/spatial/map-inputs";
import { MAP_BINDING_CONTRACT, type DataCenterMapBinding } from "@/services/data-center/map-contract";
import { DC_OTHER_SHA, DC_OTHER_VERSION_ID, DC_SHA, DC_VERSION_ID, FakeDataCenterPort, makeReference, type FakeDataCenterBehaviour } from "./support/spatial-fake-dc-port";
import { osmProvenance, publishedRelease, realBoundary, RELEASE_ID } from "./support/spatial-map-fixtures";

const EVALUATED_AT = "2026-10-20T12:00:00.000Z";
const ARTIFACT_SHA = "5e6f7a8b".repeat(8);
const address = { releaseId: RELEASE_ID, layerKey: "places" };

const layerInput = (over: Record<string, unknown> = {}) => buildMapLayerInput({
  layerKey: "places", roles: ["place:locality"], release: publishedRelease, boundary: realBoundary(), provenance: osmProvenance, registered: true, evaluatedAt: EVALUATED_AT, ...over,
});
const bindingOf = (over: { map?: Partial<DataCenterMapBinding["map"]>; reference?: ReturnType<typeof makeReference> } = {}): DataCenterMapBinding => ({
  contract: MAP_BINDING_CONTRACT, map: { releaseId: RELEASE_ID, layerKey: "places", artifactSha256: ARTIFACT_SHA, exportsArtifact: false, ...over.map }, reference: over.reference ?? makeReference(),
});
const reconcile = (binding: unknown, behaviour: FakeDataCenterBehaviour = {}, layer = address) => {
  const port = new FakeDataCenterPort(behaviour);
  return { port, outcome: reconcileMapBinding({ binding, layer, port }) };
};
const failure = (action: () => unknown) => { try { action(); } catch (error) { return error as EngineError; } return null; };

describe("a Map layer bound to a Data Center version: reconciliation", () => {
  it("is reconciled when the Data Center still says what the snapshot says, asking for exactly the version the release is bound to", async () => {
    const { port, outcome } = reconcile(bindingOf());
    expect(await outcome).toMatchObject({ status: "RECONCILED", findings: [], reference: { version: { versionId: DC_VERSION_ID } } });
    expect(port.calls).toEqual([{ method: "resolveMapReference", request: DC_VERSION_ID }]);
  });

  it.each<[string, unknown]>([
    ["nothing", null],
    ["text", "binding"],
    ["an empty object", {}],
    ["another contract", { ...bindingOf(), contract: "jenan.data-center.map-binding/v2" }],
    ["an extra member", { ...bindingOf(), note: "extra" }],
    ["no reference snapshot", { contract: MAP_BINDING_CONTRACT, map: bindingOf().map }],
    ["an exported artifact with no digest of its own", bindingOf({ map: { exportsArtifact: true, artifactSha256: undefined } })],
    ["a digest that is not a SHA-256", bindingOf({ map: { artifactSha256: "not-a-digest" } })],
    ["a snapshot that breaks the Data Center's contract", { ...bindingOf(), reference: { ...makeReference(), contract: "other" } }],
  ])("refuses a binding that is %s, guesses nothing and asks the Data Center nothing", async (_name, binding) => {
    const { port, outcome } = reconcile(binding);
    expect(await outcome).toEqual({ status: "NOT_REGISTERED", refusal: "BINDING_INVALID", findings: [] });
    expect(port.calls).toEqual([]);
  });

  it("refuses a binding kept for another layer or another release", async () => {
    for (const layer of [{ releaseId: RELEASE_ID, layerKey: "pois" }, { releaseId: "0f3b2c1a-5d4e-4f60-8a9b-1c2d3e4f5a6b", layerKey: "places" }]) {
      const { port, outcome } = reconcile(bindingOf(), {}, layer);
      expect(await outcome).toEqual({ status: "NOT_REGISTERED", refusal: "BINDING_FOR_ANOTHER_LAYER", findings: [] });
      expect(port.calls).toEqual([]);
    }
  });

  it("refuses a version the Data Center does not make available, without looking for another one, and says why in the Data Center's own finding", async () => {
    const { port, outcome } = reconcile(bindingOf(), { resolveMapReference: null });
    expect(await outcome).toEqual({
      status: "NOT_REGISTERED", refusal: "VERSION_UNAVAILABLE",
      findings: [{ code: "DATA_CENTER_VERSION_UNAVAILABLE", blocking: true, message: expect.stringContaining("no longer a published, accessible Data Center version") }],
    });
    // Exactly one question, about exactly that version: no discovery, no read, no fallback to a newer version.
    expect(port.calls).toEqual([{ method: "resolveMapReference", request: DC_VERSION_ID }]);
  });

  it("refuses a Data Center that now describes another version or other content than the snapshot", async () => {
    const other = await reconcile(bindingOf(), { resolveMapReference: makeReference({ version: { versionId: DC_OTHER_VERSION_ID } }) }).outcome;
    expect(other).toMatchObject({ status: "NOT_REGISTERED", refusal: "INCONSISTENT" });
    expect(other.findings.filter((finding) => finding.blocking).map((finding) => finding.code)).toEqual(["VERSION_MISMATCH"]);
    const changed = await reconcile(bindingOf(), { resolveMapReference: makeReference({ version: { checksum: DC_OTHER_SHA } }) }).outcome;
    expect(changed).toMatchObject({ status: "NOT_REGISTERED", refusal: "INCONSISTENT" });
    expect(changed.findings.filter((finding) => finding.blocking).map((finding) => finding.code)).toEqual(["CHECKSUM_MISMATCH"]);
  });

  it("refuses an exported artifact whose source no longer allows export, or whose license was tightened", async () => {
    const exported = bindingOf({ map: { exportsArtifact: true } });
    const noExport = await reconcile(exported, { resolveMapReference: makeReference({ rights: { allowExport: false } }) }).outcome;
    expect(noExport.findings.filter((finding) => finding.blocking).map((finding) => finding.code)).toEqual(["EXPORT_NO_LONGER_PERMITTED"]);
    const restricted = await reconcile(exported, { resolveMapReference: makeReference({ rights: { licenseClass: "RESTRICTED", allowExport: false } }) }).outcome;
    expect(restricted).toMatchObject({ status: "NOT_REGISTERED", refusal: "INCONSISTENT" });
    expect(restricted.findings.filter((finding) => finding.blocking).map((finding) => finding.code)).toEqual(["EXPORT_NO_LONGER_PERMITTED", "LICENSE_CLASS_CHANGED"]);
  });

  it("reports a Data Center that could not be asked as such, and lets any other failure through", async () => {
    expect(await reconcile(bindingOf(), { resolveMapReference: new DataCenterProviderError("UNAVAILABLE") }).outcome).toEqual({ status: "NOT_REGISTERED", refusal: "BACKEND_UNAVAILABLE", findings: [] });
    await expect(reconcile(bindingOf(), { resolveMapReference: new TypeError("boom") }).outcome).rejects.toThrow("boom");
  });

  it("does not accept an answer that is not in the Data Center's contract", async () => {
    const malformed = { ...makeReference(), contract: "something-else" } as never;
    expect(await reconcile(bindingOf(), { resolveMapReference: malformed }).outcome).toEqual({ status: "NOT_REGISTERED", refusal: "BACKEND_UNAVAILABLE", findings: [] });
  });

  it("names every refusal it can give", () => {
    expect([...mapBindingRefusals].sort()).toEqual(["BACKEND_UNAVAILABLE", "BINDING_FOR_ANOTHER_LAYER", "BINDING_INVALID", "INCONSISTENT", "VERSION_UNAVAILABLE"]);
  });
});

describe("a Map layer bound to a Data Center version: what the layer says afterwards", () => {
  const reconciled = async (behaviour: FakeDataCenterBehaviour = {}, binding = bindingOf()) => {
    const outcome = await reconcile(binding, behaviour).outcome;
    if (outcome.status !== "RECONCILED") throw new Error(`not reconciled: ${outcome.refusal}`);
    return outcome;
  };

  it("takes the Data Center's rights, ownership, source, attribution, quality, evidence and freshness, and keeps the Map's layer, artifact and geometry", async () => {
    const layer = layerInput();
    const { input, gaps } = applyMapBinding(layer, await reconciled(), EVALUATED_AT);
    expect(engineInputSchema.safeParse(input).success).toBe(true);
    // The Map's: what the layer is, and its published artifact.
    expect(input).toMatchObject({ id: layer.id, roles: layer.roles, kind: "MAP_LAYER", governance: "MAP_REGISTERED", ref: layer.ref, checksum: { algorithm: "SHA-256", value: ARTIFACT_SHA } });
    // The Data Center's: everything about rights, source and quality.
    expect(input).toMatchObject({
      ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", allowExport: true, completeness: "UNKNOWN", evidenceStatus: "ESTIMATED",
      attribution: { text: "© Ministry of Health, 2026", required: true },
      source: { name: "Ministry of Health register", organization: "Ministry of Health", url: "https://data.example.test/hospitals" },
      quality: { status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2" },
      freshness: { status: "FRESH", sourcePublishedAt: "2026-05-15T00:00:00.000Z", freshnessDays: 365 },
    });
    expect(gaps).toEqual([]);
    // What the unbound layer lacked is now stated by the Data Center, and nothing was invented to fill it.
    expect(deriveInputGaps(layer).map((gap) => gap.code)).toEqual(expect.arrayContaining(["LICENSE_CLASS_UNDECLARED", "QUALITY_UNAVAILABLE"]));
    expect(deriveInputGaps(input).map((gap) => gap.code)).not.toEqual(expect.arrayContaining(["LICENSE_CLASS_UNDECLARED", "QUALITY_UNAVAILABLE"]));
    expect(deriveRights([layer]).allowExport).toBe(false);
    expect(deriveRights([input]).allowExport).toBe(true);
  });

  it("says where the rights, source and quality come from, and that the artifact is the Map's", async () => {
    const { input } = applyMapBinding(layerInput(), await reconciled(), EVALUATED_AT);
    expect(input.limitations).toContain(`Rights, ownership, source, attribution, quality and freshness are those the Data Center states for version ${DC_VERSION_ID} (SHA-256 ${DC_SHA.slice(0, 12)}…), to which Map release ${RELEASE_ID} is bound; the artifact and its geometry are the Map's.`);
    expect(input.limitations).toEqual([...input.limitations].sort());
    // The digest is the Map artifact's: the Data Center content's digest is a different thing and is never put in its place.
    expect(input.checksum?.value).toBe(ARTIFACT_SHA);
    expect(input.checksum?.value).not.toBe(DC_SHA);
  });

  it("never makes a layer registered: a layer the Map did not register stays unregistered", async () => {
    const { input } = applyMapBinding(layerInput({ registered: false }), await reconciled(), EVALUATED_AT);
    expect(input.governance).toBe("MAP_UNREGISTERED");
    expect(input.licenseClass).toBe("OPEN_LICENSE");
    expect(deriveInputGaps(input).map((gap) => gap.code)).toContain("MAP_LAYER_UNREGISTERED");
  });

  it("applies the Data Center's declared coverage, and the Map's extent only when the Data Center declares none", async () => {
    const layer = layerInput();
    const declared = applyMapBinding(layer, await reconciled(), EVALUATED_AT).input;
    expect(declared.coverage).toEqual({ crs: "WGS84", countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: { west: 46.0, south: 24.3, east: 47.3, north: 25.1 } });
    const undeclared = applyMapBinding(layer, await reconciled({ resolveMapReference: makeReference({ coverage: null }) }), EVALUATED_AT).input;
    expect(undeclared.coverage).toEqual(layer.coverage);
    expect(layer.coverage).not.toBeNull();
  });

  it("keeps the Map's own digest when the binding records none, and says so when there is none at all", async () => {
    const noDigest = bindingOf({ map: { artifactSha256: undefined } });
    const kept = applyMapBinding(layerInput({}), await reconciled({}, noDigest), EVALUATED_AT).input;
    expect(kept.checksum).toBeNull();
    expect(kept.limitations).toContain("The Map records no checksum of the published artifact for this layer.");
    const own = { ...layerInput(), checksum: { algorithm: "SHA-256" as const, value: "ab".repeat(32) } };
    const retained = applyMapBinding(own, await reconciled({}, noDigest), EVALUATED_AT).input;
    expect(retained.checksum?.value).toBe("ab".repeat(32));
    expect(retained.limitations).not.toContain("The Map records no checksum of the published artifact for this layer.");
  });

  it("uses what the Data Center says now, not the snapshot, when it changed something that does not decide the layer, and reports each change", async () => {
    const current = makeReference({ rights: { license: "ODbL-1.0 (revised 2026)", usagePolicy: "Credit required; no redistribution of derived tiles", attribution: { text: "© Ministry of Health, Riyadh 2027" } }, ownership: { ownership: "USER_OWNED" } });
    const outcome = await reconciled({ resolveMapReference: current });
    expect(outcome.findings.map((finding) => finding.code)).toEqual(["LICENSE_CHANGED", "USAGE_POLICY_CHANGED", "ATTRIBUTION_CHANGED", "OWNERSHIP_CHANGED"]);
    const { input, gaps } = applyMapBinding(layerInput(), outcome, EVALUATED_AT);
    expect(input).toMatchObject({ license: "ODbL-1.0 (revised 2026)", usagePolicy: "Credit required; no redistribution of derived tiles", attribution: { text: "© Ministry of Health, Riyadh 2027" }, ownership: "USER_OWNED" });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ code: "MAP_DATA_CENTER_BINDING_CHANGED", severity: "INFO", inputId: input.id });
    expect(gaps[0]?.message.en).toContain("(LICENSE_CHANGED, USAGE_POLICY_CHANGED, ATTRIBUTION_CHANGED, OWNERSHIP_CHANGED)");
    expect(gapSchema.safeParse(gaps[0]).success).toBe(true);
  });

  it("treats a layer whose binding is refused as unregistered, never as registered on the Map's word alone, and says why", async () => {
    const layer = layerInput();
    for (const [behaviour, reason] of [
      [{ resolveMapReference: null }, "VERSION_UNAVAILABLE: DATA_CENTER_VERSION_UNAVAILABLE"],
      [{ resolveMapReference: makeReference({ version: { checksum: DC_OTHER_SHA } }) }, "INCONSISTENT: CHECKSUM_MISMATCH"],
    ] as Array<[FakeDataCenterBehaviour, string]>) {
      const outcome = await reconcile(bindingOf(), behaviour).outcome;
      const { input, gaps } = applyMapBinding(layer, outcome, EVALUATED_AT);
      expect(input).toEqual({ ...layer, governance: "MAP_UNREGISTERED" });
      expect(engineInputSchema.safeParse(input).success).toBe(true);
      expect(deriveInputGaps(input).map((gap) => gap.code)).toContain("MAP_LAYER_UNREGISTERED");
      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toMatchObject({ code: "MAP_DATA_CENTER_BINDING_REFUSED", severity: "WARNING", inputId: layer.id });
      expect(gaps[0]?.message.en).toContain(`(reason: ${reason})`);
      expect(gapSchema.safeParse(gaps[0]).success).toBe(true);
    }
    const invalid = applyMapBinding(layer, await reconcile({ junk: true }).outcome, EVALUATED_AT);
    expect(invalid.gaps[0]?.message.en).toContain("(reason: BINDING_INVALID)");
    // None of the Data Center's statements reach a layer that was refused: its rights are still undeclared and export is still denied.
    expect(invalid.input).toMatchObject({ licenseClass: null, allowExport: false, quality: { status: "UNAVAILABLE" } });
  });

  it("only works on a Map layer", async () => {
    const outcome = await reconciled();
    const dataCenterInput = { ...layerInput(), kind: "DATA_CENTER_VERSION" as const };
    expect(failure(() => applyMapBinding(dataCenterInput, outcome, EVALUATED_AT))).toMatchObject({ code: "CONTRACT_VIOLATION" });
  });

  it("does not modify the layer or the outcome it was given", async () => {
    const layer = layerInput();
    const outcome = await reconciled();
    const [layerBefore, outcomeBefore] = [structuredClone(layer), structuredClone(outcome)];
    applyMapBinding(layer, outcome, EVALUATED_AT);
    applyMapBinding(layer, { status: "NOT_REGISTERED", refusal: "BINDING_INVALID", findings: [] }, EVALUATED_AT);
    expect(layer).toEqual(layerBefore);
    expect(outcome).toEqual(outcomeBefore);
  });
});
