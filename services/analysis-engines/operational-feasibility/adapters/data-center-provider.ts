import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { discoverDataCenterVersions } from "@/services/data-center/discovery";
import { readDataCenterVersionContent } from "@/services/data-center/version-content";
import { operationalTimestamp } from "../model";
import { operationalDiscoverySchema, type OperationalDataPort } from "../data-port";
import { prepareOperationalData } from "../data-sources";

export interface OperationalProviderContext {
  evaluatedAt: string; specialty?: string; missionContext?: string; organizationId?: string;
}
/** Actor and access scope are trusted server context, not model-supplied permissions. */
export function createOperationalDataCenterProvider(trustedActor: DataCenterActor, trustedContext: OperationalProviderContext): OperationalDataPort {
  const actor = { ...trustedActor }; const context = { ...trustedContext };
  const now = new Date(operationalTimestamp.parse(context.evaluatedAt));
  return {
    discover: async (query) => operationalDiscoverySchema.parse(await discoverDataCenterVersions({
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
          if (!scoped.candidates.some((c) => c.reference.version.versionId === query.versionId)) return { status: "NOT_AVAILABLE" };
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
export function prepareOperationalDataCenterInputs(request: unknown, actor: DataCenterActor, context: OperationalProviderContext) {
  return prepareOperationalData(createOperationalDataCenterProvider(actor, context), request, context.evaluatedAt);
}
