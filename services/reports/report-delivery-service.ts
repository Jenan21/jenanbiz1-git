import { randomUUID } from "node:crypto";

import { ReportDeliveryStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ReportRoute } from "@/lib/reports/report-routes";
import type { EmailProvider } from "@/services/providers.contracts";
import { getReportView } from "@/services/reports/report-view-service";

export async function requestReportEmail(input: { projectId?: string; recipient: string; reportPath: ReportRoute; subject: string }, userId: string, provider?: EmailProvider) {
  const report = await getReportView({ path: input.reportPath, projectId: input.projectId, userId });
  if (report.sourceState !== "LIVE") throw new Error("Report requires an approved live source before delivery");
  const traceId = randomUUID();
  const delivery = await db.reportDelivery.create({ data: { projectId: input.projectId, recipient: input.recipient, reportPath: input.reportPath, status: provider ? ReportDeliveryStatus.QUEUED : ReportDeliveryStatus.PENDING_PROVIDER, subject: input.subject, traceId, userId } });
  await db.auditLog.create({ data: { actorId: userId, action: "report.email.requested", entityType: "ReportDelivery", entityId: delivery.id, metadata: { provider: provider?.name ?? null, reportPath: input.reportPath, traceId } } });
  if (!provider) return delivery;
  try {
    const sent = await provider.send({ subject: input.subject, text: `${report.title}\n${report.subtitle}\n${input.reportPath}`, to: input.recipient, traceId });
    return await db.reportDelivery.update({ where: { id: delivery.id }, data: { externalId: sent.messageId, provider: provider.name, sentAt: new Date(), status: ReportDeliveryStatus.SENT } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    return db.reportDelivery.update({ where: { id: delivery.id }, data: { error: message, provider: provider.name, status: ReportDeliveryStatus.FAILED } });
  }
}