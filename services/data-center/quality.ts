import type { Prisma } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import { DataCenterError, type DataCenterActor, type DataCenterQualityInput, qualityAssessmentSchema } from "./contracts";
import { requireDataCenterAdmin } from "./policy";
import { auditDataCenter, getAccessibleItem, lockDataCenterItem } from "./service";

/**
 * Records a human-entered quality statement about one version. Nothing here measures or estimates quality: the administrator
 * supplies the score together with the method, method version and measurement date, or states that data was insufficient.
 */
export async function recordDataCenterQualityAssessment(input: DataCenterQualityInput, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  const data = qualityAssessmentSchema.parse(input);
  const measuredAt = new Date(data.measuredAt);
  if (measuredAt > new Date()) throw new DataCenterError("FUTURE_MEASUREMENT_DATE");
  return db.$transaction(async (tx) => {
    const version = await tx.dataCenterVersion.findUnique({ where: { id: data.versionId }, select: { id: true, itemId: true } });
    if (!version) throw new DataCenterError("VERSION_NOT_FOUND", 404);
    await lockDataCenterItem(tx, version.itemId);
    await getAccessibleItem(tx, actor, version.itemId, true);
    const assessment = await tx.dataCenterQualityAssessment.create({ data: {
      versionId: version.id, status: data.status, score: data.status === "MEASURED" ? data.score : null,
      method: data.method, methodVersion: data.methodVersion, measuredAt, explanation: data.explanation,
      metrics: data.metrics as Prisma.InputJsonObject, assessedById: actor.id,
    } });
    await tx.dataCenterItem.update({ where: { id: version.itemId }, data: { revision: { increment: 1 } } });
    await auditDataCenter(tx, actor, "quality.recorded", assessment.id, { versionId: version.id, status: assessment.status, score: assessment.score, method: assessment.method, methodVersion: assessment.methodVersion });
    return assessment;
  });
}

/** The most recent assessment of a version, or null when none was ever recorded (quality unavailable). */
export async function latestDataCenterQuality(tx: DbExecutor, versionId: string) {
  return tx.dataCenterQualityAssessment.findFirst({ where: { versionId }, orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }] });
}
