CREATE TYPE "TalentSupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

ALTER TABLE "Organization"
ADD COLUMN "description" TEXT,
ADD COLUMN "industry" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "countryCode" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "employeeRange" TEXT,
ADD COLUMN "hiringSettings" JSONB;

CREATE TABLE "TalentShortlist" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TalentShortlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TalentShortlistMember" (
    "id" TEXT NOT NULL,
    "shortlistId" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TalentShortlistMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TalentSupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TalentSupportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TalentSupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TalentShortlist_ownerId_updatedAt_idx" ON "TalentShortlist"("ownerId", "updatedAt");
CREATE INDEX "TalentShortlist_organizationId_idx" ON "TalentShortlist"("organizationId");
CREATE UNIQUE INDEX "TalentShortlistMember_shortlistId_candidateProfileId_key" ON "TalentShortlistMember"("shortlistId", "candidateProfileId");
CREATE INDEX "TalentShortlistMember_candidateProfileId_idx" ON "TalentShortlistMember"("candidateProfileId");
CREATE INDEX "TalentSupportTicket_userId_status_updatedAt_idx" ON "TalentSupportTicket"("userId", "status", "updatedAt");

ALTER TABLE "TalentShortlist" ADD CONSTRAINT "TalentShortlist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentShortlist" ADD CONSTRAINT "TalentShortlist_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TalentShortlistMember" ADD CONSTRAINT "TalentShortlistMember_shortlistId_fkey" FOREIGN KEY ("shortlistId") REFERENCES "TalentShortlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentShortlistMember" ADD CONSTRAINT "TalentShortlistMember_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "TalentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentSupportTicket" ADD CONSTRAINT "TalentSupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
