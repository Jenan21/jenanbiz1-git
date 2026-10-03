CREATE TABLE "ProjectAssessmentEvidence" (
    "assessmentId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAssessmentEvidence_pkey" PRIMARY KEY ("assessmentId", "fileAssetId")
);

CREATE INDEX "ProjectAssessmentEvidence_fileAssetId_idx" ON "ProjectAssessmentEvidence"("fileAssetId");

ALTER TABLE "ProjectAssessmentEvidence"
ADD CONSTRAINT "ProjectAssessmentEvidence_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "ProjectAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAssessmentEvidence"
ADD CONSTRAINT "ProjectAssessmentEvidence_fileAssetId_fkey"
FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
