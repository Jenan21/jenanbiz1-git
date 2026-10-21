import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { discoverDataCenterVersions } from "@/services/data-center/discovery";
import { readDataCenterVersionContent } from "@/services/data-center/version-content";
import { timestampSchema } from "../../shared/primitives";
import type { MarketDataPort } from "../data-port";
import { prepareMarketData } from "../data-sources";
import { normalizeMarketRequest } from "../request";
import { runMarketAnalysis, type MarketRunContext } from "../result";

interface MarketProviderContext {
  evaluatedAt: string; specialty?: string; missionContext?: string; organizationId?: string;
}

/** Actor and context come from the trusted server, never from a Market request's payload. */
export function createMarketDataCenterProvider(
  trustedActor: DataCenterActor,
  trustedContext: MarketProviderContext,
): MarketDataPort {
  const actor = { ...trustedActor };
  const context = { ...trustedContext };
  const now = new Date(timestampSchema.parse(context.evaluatedAt));
  return {
    discover: (query) => discoverDataCenterVersions({
      ...query, layer: "DATA", specialty: context.specialty,
      missionContext: context.missionContext, organizationId: context.organizationId,
    }, actor, { now }),
    async read(query) {
      try {
        if (context.organizationId) {
          const scoped = await discoverDataCenterVersions({
            versionIds: [query.versionId], organizationId: context.organizationId, layer: "DATA",
            specialty: context.specialty, missionContext: context.missionContext,
          }, actor, { now });
          if (!scoped.candidates.some((candidate) => candidate.reference.version.versionId === query.versionId)) return { status: "NOT_AVAILABLE" };
        }
        const result = await readDataCenterVersionContent({
          ...query, specialty: context.specialty, missionContext: context.missionContext,
        }, actor, { now });
        return { status: "AVAILABLE", reference: result.reference, content: result.content, contentKind: result.contentKind, integrity: result.integrity };
      } catch (error) {
        if (!(error instanceof DataCenterError)) throw error;
        if (error.code === "PUBLISHED_VERSION_NOT_FOUND") return { status: "NOT_AVAILABLE" };
        if (error.code === "VERSION_CHECKSUM_MISMATCH" || error.code === "EXPECTED_CHECKSUM_MISMATCH") return { status: "INTEGRITY_ERROR" };
        throw error;
      }
    },
  };
}

export function prepareMarketDataCenterInputs(request: unknown, actor: DataCenterActor, context: MarketProviderContext) {
  const normalized = normalizeMarketRequest(request, { evaluatedAt: context.evaluatedAt });
  return prepareMarketData(createMarketDataCenterProvider(actor, { ...context, evaluatedAt: normalized.evaluatedAt }), normalized.normalized, normalized.evaluatedAt);
}

export function runMarketDataCenterAnalysis(
  request: unknown, actor: DataCenterActor, context: MarketProviderContext & MarketRunContext,
) {
  return runMarketAnalysis(request, createMarketDataCenterProvider(actor, context), {
    runId: context.runId, evaluatedAt: context.evaluatedAt, environment: context.environment, timing: context.timing,
  });
}
