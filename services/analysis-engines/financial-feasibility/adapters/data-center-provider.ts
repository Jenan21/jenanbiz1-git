import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { discoverDataCenterVersions } from "@/services/data-center/discovery";
import { readDataCenterVersionContent } from "@/services/data-center/version-content";
import { financialTimestamp } from "../model";
import { financialDiscoverySchema, type FinancialDataPort } from "../data-port";
import { prepareFinancialData } from "../data-sources";

export interface FinancialProviderContext {
  evaluatedAt: string; specialty?: string; missionContext?: string; organizationId?: string;
}
/** Only the server supplies the actor and access scope; financial model fields cannot grant access. */
export function createFinancialDataCenterProvider(trustedActor: DataCenterActor, trustedContext: FinancialProviderContext): FinancialDataPort {
  const actor = { ...trustedActor }; const context = { ...trustedContext };
  const now = new Date(financialTimestamp.parse(context.evaluatedAt));
  return {
    discover: async (query) => financialDiscoverySchema.parse(await discoverDataCenterVersions({
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
export function prepareFinancialDataCenterInputs(request: unknown, actor: DataCenterActor, context: FinancialProviderContext) {
  return prepareFinancialData(createFinancialDataCenterProvider(actor, context), request, context.evaluatedAt);
}
