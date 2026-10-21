import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { discoverDataCenterVersions } from "@/services/data-center/discovery";
import { readDataCenterVersionContent } from "@/services/data-center/version-content";
import { competitorTimestampSchema } from "../model";
import { prepareCompetitorData } from "../data-sources";
import type { CompetitorDataPort } from "../data-port";

export interface CompetitorProviderContext {
  evaluatedAt: string; specialty?: string; missionContext?: string; organizationId?: string;
}
/** Only trusted server actor/context may construct this read capability. Nothing writes usage or audit. */
export function createCompetitorDataCenterProvider(trustedActor: DataCenterActor, trustedContext: CompetitorProviderContext): CompetitorDataPort {
  const actor = { ...trustedActor }; const context = { ...trustedContext };
  const now = new Date(competitorTimestampSchema.parse(context.evaluatedAt));
  return {
    discover: (query) => discoverDataCenterVersions({
      ...query, layer: "DATA", specialty: context.specialty, missionContext: context.missionContext, organizationId: context.organizationId,
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
        const result = await readDataCenterVersionContent({ ...query, specialty: context.specialty, missionContext: context.missionContext }, actor, { now });
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
export function prepareCompetitorDataCenterInputs(request: unknown, actor: DataCenterActor, context: CompetitorProviderContext) {
  return prepareCompetitorData(createCompetitorDataCenterProvider(actor, context), request, context.evaluatedAt);
}
