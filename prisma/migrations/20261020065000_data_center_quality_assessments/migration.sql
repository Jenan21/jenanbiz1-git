-- Explainable, append-only quality assessments per Data Center version.
-- A score exists only together with the method, method version and measurement date that produced it. A version without a row
-- has no quality information (unavailable); nothing here computes or estimates a score. assessedById is a database-only foreign key.
CREATE TYPE "DataCenterQualityStatus" AS ENUM ('MEASURED', 'INSUFFICIENT_DATA');

CREATE TABLE "DataCenterQualityAssessment" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "status" "DataCenterQualityStatus" NOT NULL,
  "score" DOUBLE PRECISION,
  "method" TEXT NOT NULL,
  "methodVersion" TEXT NOT NULL,
  "measuredAt" TIMESTAMP(3) NOT NULL,
  "explanation" TEXT NOT NULL,
  "metrics" JSONB NOT NULL DEFAULT '{}',
  "assessedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterQualityAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataCenterQualityAssessment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "DataCenterQualityAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "DataCenterQualityAssessment_score_check" CHECK (("status" = 'MEASURED') = ("score" IS NOT NULL)),
  CONSTRAINT "DataCenterQualityAssessment_score_range_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 1)),
  CONSTRAINT "DataCenterQualityAssessment_method_check" CHECK (
    length(btrim("method")) BETWEEN 1 AND 120 AND length(btrim("methodVersion")) BETWEEN 1 AND 60 AND length(btrim("explanation")) BETWEEN 1 AND 4000
  ),
  CONSTRAINT "DataCenterQualityAssessment_metrics_check" CHECK (jsonb_typeof("metrics") = 'object' AND length("metrics"::text) <= 8000)
);

CREATE INDEX "DataCenterQualityAssessment_versionId_measuredAt_idx" ON "DataCenterQualityAssessment"("versionId", "measuredAt");
CREATE TRIGGER "DataCenterQualityAssessment_immutable" BEFORE UPDATE OR DELETE ON "DataCenterQualityAssessment" FOR EACH ROW EXECUTE FUNCTION "data_center_immutable"();
