CREATE TABLE "AnalysisEngineRun" (
    "runId" TEXT NOT NULL,
    "engineKey" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "requestContract" TEXT NOT NULL,
    "resultContract" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "inputsHash" TEXT,
    "outputHash" TEXT,
    "request" JSONB NOT NULL,
    "result" JSONB,
    "errorCode" TEXT,
    "confidence" JSONB,
    "gaps" JSONB NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "subject" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "costUnits" INTEGER NOT NULL,
    "budgetUnits" INTEGER NOT NULL,
    "runtime" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisEngineRun_pkey" PRIMARY KEY ("runId"),
    CONSTRAINT "AnalysisEngineRun_actorKind_check" CHECK ("actorKind" IN ('USER', 'ROBOT', 'SYSTEM')),
    CONSTRAINT "AnalysisEngineRun_status_check" CHECK ("status" IN ('COMPLETED', 'COMPLETED_WITH_GAPS', 'FAILED'))
);

CREATE TABLE "AnalysisEngineRunInput" (
    "runId" TEXT NOT NULL,
    "inputId" TEXT NOT NULL,
    "roles" TEXT[] NOT NULL,
    "kind" TEXT NOT NULL,
    "governance" TEXT NOT NULL,
    "completeness" TEXT NOT NULL,
    "refSystem" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "refVersion" INTEGER,
    "checksum" TEXT,
    "dataCenterVersionId" TEXT,
    "dataCenterSourceId" TEXT,
    "dataCenterTypeKey" TEXT,
    "contentHash" TEXT,
    "provenance" JSONB,
    "usageIntent" JSONB,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisEngineRunInput_pkey" PRIMARY KEY ("runId", "inputId"),
    CONSTRAINT "AnalysisEngineRunInput_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisEngineRun"("runId") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "AnalysisEngineRunInput_dc_provenance_check" CHECK (
      ("kind" = 'DATA_CENTER_VERSION' AND "dataCenterVersionId" IS NOT NULL AND "dataCenterSourceId" IS NOT NULL AND "dataCenterTypeKey" IS NOT NULL AND "contentHash" IS NOT NULL AND "provenance" IS NOT NULL AND "usageIntent" IS NOT NULL)
      OR ("kind" <> 'DATA_CENTER_VERSION' AND "dataCenterVersionId" IS NULL AND "dataCenterSourceId" IS NULL AND "dataCenterTypeKey" IS NULL AND "contentHash" IS NULL AND "provenance" IS NULL AND "usageIntent" IS NULL)
    )
);

CREATE INDEX "AnalysisEngineRun_engineKey_createdAt_idx" ON "AnalysisEngineRun"("engineKey", "createdAt");
CREATE INDEX "AnalysisEngineRun_actorKind_actorId_createdAt_idx" ON "AnalysisEngineRun"("actorKind", "actorId", "createdAt");
CREATE INDEX "AnalysisEngineRunInput_dataCenterVersionId_contentHash_idx" ON "AnalysisEngineRunInput"("dataCenterVersionId", "contentHash");

CREATE FUNCTION "reject_analysis_engine_history_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Analysis engine history is append-only';
END;
$$;

CREATE TRIGGER "AnalysisEngineRun_append_only"
BEFORE UPDATE OR DELETE ON "AnalysisEngineRun"
FOR EACH ROW EXECUTE FUNCTION "reject_analysis_engine_history_mutation"();

CREATE TRIGGER "AnalysisEngineRunInput_append_only"
BEFORE UPDATE OR DELETE ON "AnalysisEngineRunInput"
FOR EACH ROW EXECUTE FUNCTION "reject_analysis_engine_history_mutation"();
