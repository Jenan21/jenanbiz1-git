-- CreateEnum
CREATE TYPE "ReportDeliveryStatus" AS ENUM ('PENDING_PROVIDER', 'QUEUED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ReportDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportPath" TEXT NOT NULL,
    "projectId" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ReportDeliveryStatus" NOT NULL DEFAULT 'PENDING_PROVIDER',
    "provider" TEXT,
    "externalId" TEXT,
    "traceId" TEXT NOT NULL,
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportDelivery_traceId_key" ON "ReportDelivery"("traceId");

-- CreateIndex
CREATE INDEX "ReportDelivery_userId_status_requestedAt_idx" ON "ReportDelivery"("userId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "ReportDelivery_recipient_requestedAt_idx" ON "ReportDelivery"("recipient", "requestedAt");

-- AddForeignKey
ALTER TABLE "ReportDelivery" ADD CONSTRAINT "ReportDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
