CREATE TYPE "RobotInformationRequestStatus" AS ENUM ('REQUESTED', 'REVIEWED', 'CLOSED');

CREATE TABLE "RobotInformationRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "sector" TEXT,
    "location" TEXT,
    "environment" TEXT,
    "budgetMinor" INTEGER,
    "status" "RobotInformationRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RobotInformationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RobotInformationRequest_requesterId_status_createdAt_idx" ON "RobotInformationRequest"("requesterId", "status", "createdAt");
CREATE INDEX "RobotInformationRequest_robotId_status_createdAt_idx" ON "RobotInformationRequest"("robotId", "status", "createdAt");
ALTER TABLE "RobotInformationRequest" ADD CONSTRAINT "RobotInformationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RobotInformationRequest" ADD CONSTRAINT "RobotInformationRequest_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;