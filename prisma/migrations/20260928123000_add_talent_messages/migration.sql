CREATE TABLE "TalentMessage" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TalentMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TalentMessage_applicationId_createdAt_idx" ON "TalentMessage"("applicationId", "createdAt");
CREATE INDEX "TalentMessage_senderId_createdAt_idx" ON "TalentMessage"("senderId", "createdAt");

ALTER TABLE "TalentMessage" ADD CONSTRAINT "TalentMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentMessage" ADD CONSTRAINT "TalentMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;