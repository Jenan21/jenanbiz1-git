import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { discoverDataCenterVersions } from "@/services/data-center/discovery";
import { readDataCenterVersionContent } from "@/services/data-center/version-content";
import { timestamp } from "../model";
import { prepareOpportunityData } from "../data-sources";
import { opportunityDiscoverySchema, type OpportunityDataPort } from "../data-port";

export interface OpportunityProviderContext {
  evaluatedAt: string; specialty?: string; missionContext?: string; organizationId?: string;
}
/** The server supplies actor and context; the request cannot grant permissions or select an organization. */
export function createOpportunityDataCenterProvider(trustedActor: DataCenterActor, trustedContext: OpportunityProviderContext): OpportunityDataPort {
  const actor = { ...trustedActor }; const context = { ...trustedContext };
  const now = new Date(timestamp.parse(context.evaluatedAt));
  return {
    discover: async (query) => opportunityDiscoverySchema.parse(await discoverDataCenterVersions({
      versionIds: [...query.versionIds], layer: "DATA", organizationId: context.organizationId,
      specialty: context.specialty, missionContext: context.missionContext,
    }, actor, { now })),
    async read(query) {
      try {
        if (context.organizationId) {
          const scoped = await discoverDataCenterVersions({
            versionIds: [query.versionId], layer: "DATA", organizationId: context.organizationId,
            specialty: context.specialty, missionContext: context.missionContext,
          }, actor, { now });
          if (!scoped.candidates.some((candidate) => candidate.reference.version.versionId === query.versionId)) return { status: "NOT_AVAILABLE" };
        }
        const result = await readDataCenterVersionContent({
          versionId: query.versionId, expectedChecksum: query.expectedChecksum,
          specialty: context.specialty, missionContext: context.missionContext,
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
export function prepareOpportunityDataCenterInputs(request: unknown, actor: DataCenterActor, context: OpportunityProviderContext) {
  return prepareOpportunityData(createOpportunityDataCenterProvider(actor, context), request, context.evaluatedAt);
}
