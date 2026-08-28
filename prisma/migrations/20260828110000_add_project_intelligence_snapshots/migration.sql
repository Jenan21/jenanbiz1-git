CREATE TABLE "ProjectIntelligenceSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "location" JSONB,
    "population" JSONB,
    "purchasingPower" JSONB,
    "competitors" JSONB,
    "sources" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectIntelligenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectIntelligenceSnapshot_projectId_fetchedAt_idx" ON "ProjectIntelligenceSnapshot"("projectId", "fetchedAt");

ALTER TABLE "ProjectIntelligenceSnapshot" ADD CONSTRAINT "ProjectIntelligenceSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
