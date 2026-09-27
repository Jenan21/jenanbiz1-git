CREATE TYPE "KnowledgeApprovalState" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

ALTER TABLE "SharedKnowledge"
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "sourcePublishedAt" TIMESTAMP(3),
  ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "approvalState" "KnowledgeApprovalState" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE TABLE "KnowledgeVersion" (
  "id" TEXT NOT NULL,
  "knowledgeId" TEXT NOT NULL,
  "authorId" TEXT,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "sourcePublishedAt" TIMESTAMP(3),
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "approvalState" "KnowledgeApprovalState" NOT NULL DEFAULT 'DRAFT',
  "references" JSONB,
  "changeSummary" TEXT,
  "rollbackFrom" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeReview" (
  "id" TEXT NOT NULL,
  "knowledgeId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "state" "KnowledgeApprovalState" NOT NULL,
  "notes" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeEvidenceLink" (
  "knowledgeId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeEvidenceLink_pkey" PRIMARY KEY ("versionId", "evidenceId")
);

INSERT INTO "KnowledgeVersion" ("id", "knowledgeId", "version", "title", "content", "source", "confidence", "approvalState", "changeSummary", "createdAt")
SELECT 'kv_' || md5("id" || clock_timestamp()::text), "id", 1, "title", "content", "source", "confidence", 'DRAFT'::"KnowledgeApprovalState", 'Backfilled from legacy shared knowledge', "createdAt"
FROM "SharedKnowledge";

CREATE INDEX "SharedKnowledge_confidence_approvalState_idx" ON "SharedKnowledge"("confidence", "approvalState");
DROP INDEX IF EXISTS "SharedKnowledge_confidence_idx";
CREATE UNIQUE INDEX "KnowledgeVersion_knowledgeId_version_key" ON "KnowledgeVersion"("knowledgeId", "version");
CREATE INDEX "KnowledgeVersion_knowledgeId_createdAt_idx" ON "KnowledgeVersion"("knowledgeId", "createdAt");
CREATE INDEX "KnowledgeVersion_approvalState_idx" ON "KnowledgeVersion"("approvalState");
CREATE INDEX "KnowledgeReview_knowledgeId_createdAt_idx" ON "KnowledgeReview"("knowledgeId", "createdAt");
CREATE INDEX "KnowledgeReview_versionId_state_idx" ON "KnowledgeReview"("versionId", "state");
CREATE INDEX "KnowledgeEvidenceLink_knowledgeId_idx" ON "KnowledgeEvidenceLink"("knowledgeId");
CREATE INDEX "KnowledgeEvidenceLink_evidenceId_idx" ON "KnowledgeEvidenceLink"("evidenceId");

ALTER TABLE "SharedKnowledge" ADD CONSTRAINT "SharedKnowledge_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeVersion" ADD CONSTRAINT "KnowledgeVersion_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "SharedKnowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeVersion" ADD CONSTRAINT "KnowledgeVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeReview" ADD CONSTRAINT "KnowledgeReview_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "SharedKnowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeReview" ADD CONSTRAINT "KnowledgeReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "KnowledgeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeReview" ADD CONSTRAINT "KnowledgeReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEvidenceLink" ADD CONSTRAINT "KnowledgeEvidenceLink_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "SharedKnowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEvidenceLink" ADD CONSTRAINT "KnowledgeEvidenceLink_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "KnowledgeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeEvidenceLink" ADD CONSTRAINT "KnowledgeEvidenceLink_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;