-- CreateEnum
CREATE TYPE "AcademyEngagementStatus" AS ENUM ('SAVED', 'REGISTERED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "AcademyResourceEngagement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" "AcademyEngagementStatus" NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyResourceEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademyResourceEngagement_userId_resourceId_key" ON "AcademyResourceEngagement"("userId", "resourceId");

-- CreateIndex
CREATE INDEX "AcademyResourceEngagement_userId_status_updatedAt_idx" ON "AcademyResourceEngagement"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "AcademyResourceEngagement_resourceId_status_idx" ON "AcademyResourceEngagement"("resourceId", "status");

-- AddForeignKey
ALTER TABLE "AcademyResourceEngagement" ADD CONSTRAINT "AcademyResourceEngagement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyResourceEngagement" ADD CONSTRAINT "AcademyResourceEngagement_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "AcademyResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;