CREATE TABLE "TalentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "city" TEXT,
    "countryCode" TEXT,
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "skills" JSONB,
    "experience" TEXT,
    "education" TEXT,
    "desiredWorkModes" JSONB,
    "availability" TEXT,
    "cvDocumentId" TEXT,
    "isDiscoverable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TalentProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JobApplication"
ADD COLUMN "cvDocumentId" TEXT,
ADD COLUMN "profileSnapshot" JSONB,
ADD COLUMN "consentVersion" TEXT,
ADD COLUMN "consentedAt" TIMESTAMP(3),
ADD COLUMN "employerNotes" TEXT;

CREATE UNIQUE INDEX "TalentProfile_userId_key" ON "TalentProfile"("userId");
CREATE UNIQUE INDEX "TalentProfile_cvDocumentId_key" ON "TalentProfile"("cvDocumentId");
CREATE INDEX "TalentProfile_isDiscoverable_countryCode_idx" ON "TalentProfile"("isDiscoverable", "countryCode");
CREATE INDEX "JobApplication_cvDocumentId_idx" ON "JobApplication"("cvDocumentId");

ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_cvDocumentId_fkey" FOREIGN KEY ("cvDocumentId") REFERENCES "StudioDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_cvDocumentId_fkey" FOREIGN KEY ("cvDocumentId") REFERENCES "StudioDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;