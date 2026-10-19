CREATE TYPE "DataCenterScope" AS ENUM ('PLATFORM', 'ORGANIZATION', 'PRIVATE');
CREATE TYPE "DataCenterLayer" AS ENUM ('DATA', 'KNOWLEDGE', 'INTELLIGENCE', 'CONTEXT');
CREATE TYPE "DataCenterLifecycle" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "DataCenterEvidence" AS ENUM ('VERIFIED', 'ESTIMATED', 'DERIVED', 'UNVERIFIED', 'CONFLICTED');

CREATE TABLE "DataCenterType" (
  "key" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "layer" "DataCenterLayer" NOT NULL,
  "requiresIndependentReview" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "DataCenterSource" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "kind" TEXT NOT NULL, "scope" "DataCenterScope" NOT NULL,
  "organizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "owner" TEXT NOT NULL, "license" TEXT NOT NULL, "allowExport" BOOLEAN NOT NULL DEFAULT false,
  "allowRetrieval" BOOLEAN NOT NULL DEFAULT true, "freshnessDays" INTEGER NOT NULL DEFAULT 90,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterSource_scope_check" CHECK (("scope" = 'ORGANIZATION') = ("organizationId" IS NOT NULL)),
  CONSTRAINT "DataCenterSource_freshness_check" CHECK ("freshnessDays" BETWEEN 1 AND 3650)
);
CREATE TABLE "DataCenterItem" (
  "id" TEXT PRIMARY KEY, "sourceId" TEXT NOT NULL REFERENCES "DataCenterSource"("id") ON DELETE RESTRICT,
  "typeKey" TEXT NOT NULL REFERENCES "DataCenterType"("key") ON DELETE RESTRICT,
  "layer" "DataCenterLayer" NOT NULL, "title" TEXT NOT NULL, "status" "DataCenterLifecycle" NOT NULL DEFAULT 'DRAFT',
  "currentVersion" INTEGER NOT NULL DEFAULT 1, "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataCenterItem_version_check" CHECK ("currentVersion" > 0)
);
CREATE TABLE "DataCenterVersion" (
  "id" TEXT PRIMARY KEY, "itemId" TEXT NOT NULL REFERENCES "DataCenterItem"("id") ON DELETE RESTRICT,
  "number" INTEGER NOT NULL, "title" TEXT NOT NULL, "content" TEXT NOT NULL,
  "evidenceStatus" "DataCenterEvidence" NOT NULL DEFAULT 'UNVERIFIED', "origin" TEXT NOT NULL DEFAULT 'HUMAN',
  "provenance" JSONB NOT NULL, "confidence" JSONB NOT NULL,
  "specialties" TEXT[] NOT NULL, "missionContexts" TEXT[] NOT NULL, "requiredPermission" TEXT,
  "sourcePublishedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "checksum" TEXT NOT NULL,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterVersion_number_check" CHECK ("number" > 0),
  CONSTRAINT "DataCenterVersion_content_check" CHECK (length("content") BETWEEN 1 AND 200000),
  CONSTRAINT "DataCenterVersion_origin_check" CHECK ("origin" IN ('HUMAN','AI','IMPORT','CALCULATION','ACADEMY')),
  CONSTRAINT "DataCenterVersion_ai_not_verified" CHECK (NOT ("origin" = 'AI' AND "evidenceStatus" = 'VERIFIED')),
  CONSTRAINT "DataCenterVersion_itemId_number_key" UNIQUE ("itemId", "number")
);
ALTER TABLE "DataCenterItem" ADD CONSTRAINT "DataCenterItem_current_version_fkey"
  FOREIGN KEY ("id", "currentVersion") REFERENCES "DataCenterVersion"("itemId", "number") DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE "DataCenterReview" (
  "id" TEXT PRIMARY KEY, "versionId" TEXT NOT NULL REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT,
  "reviewerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "decision" TEXT NOT NULL CHECK ("decision" IN ('APPROVED','REJECTED')), "notes" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterReview_versionId_reviewerId_key" UNIQUE ("versionId", "reviewerId")
);
CREATE TABLE "DataCenterEvent" (
  "id" TEXT PRIMARY KEY, "itemId" TEXT NOT NULL REFERENCES "DataCenterItem"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL, "fromStatus" "DataCenterLifecycle", "toStatus" "DataCenterLifecycle" NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT, "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "DataCenterConflict" (
  "id" TEXT PRIMARY KEY, "itemId" TEXT NOT NULL REFERENCES "DataCenterItem"("id") ON DELETE RESTRICT,
  "otherItemId" TEXT NOT NULL REFERENCES "DataCenterItem"("id") ON DELETE RESTRICT,
  "itemVersion" INTEGER NOT NULL, "otherVersion" INTEGER NOT NULL, "reason" TEXT NOT NULL,
  "resolution" TEXT, "notes" TEXT, "resolvedById" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterConflict_distinct_check" CHECK ("itemId" <> "otherItemId"),
  CONSTRAINT "DataCenterConflict_resolution_check" CHECK (
    ("resolvedAt" IS NULL AND "resolution" IS NULL AND "resolvedById" IS NULL) OR
    ("resolvedAt" IS NOT NULL AND "resolution" IN ('KEEP_FIRST','KEEP_SECOND','KEEP_BOTH','SUPERSEDED') AND "resolvedById" IS NOT NULL AND "notes" IS NOT NULL)
  )
);
CREATE TABLE "DataCenterUsage" (
  "id" TEXT PRIMARY KEY, "versionId" TEXT NOT NULL REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "consumer" TEXT NOT NULL, "missionId" TEXT REFERENCES "Mission"("id") ON DELETE RESTRICT, "purpose" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "DataCenterImport" (
  "id" TEXT PRIMARY KEY, "sourceId" TEXT NOT NULL REFERENCES "DataCenterSource"("id") ON DELETE RESTRICT,
  "versionId" TEXT NOT NULL REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT, "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL CHECK ("sizeBytes" BETWEEN 1 AND 10485760),
  "checksum" TEXT NOT NULL, "storageKey" TEXT NOT NULL UNIQUE, "adapter" TEXT NOT NULL, "scanEngine" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "DataCenterAcademyRelease" (
  "id" TEXT PRIMARY KEY, "versionId" TEXT NOT NULL REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT,
  "targetKind" TEXT NOT NULL CHECK ("targetKind" IN ('COURSE','ROBOT','SPECIALTY')), "targetId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "approvedById" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED')),
  "notes" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "approvedAt" TIMESTAMP(3),
  CONSTRAINT "DataCenterAcademyRelease_independent_check" CHECK ("approvedById" IS NULL OR "approvedById" <> "requestedById")
);

CREATE INDEX "DataCenterSource_scope_organizationId_ownerId_idx" ON "DataCenterSource"("scope", "organizationId", "ownerId");
CREATE INDEX "DataCenterItem_sourceId_status_idx" ON "DataCenterItem"("sourceId", "status");
CREATE INDEX "DataCenterItem_layer_typeKey_status_idx" ON "DataCenterItem"("layer", "typeKey", "status");
CREATE INDEX "DataCenterVersion_createdAt_idx" ON "DataCenterVersion"("createdAt");
CREATE INDEX "DataCenterVersion_search_idx" ON "DataCenterVersion" USING GIN (to_tsvector('simple', "title" || ' ' || "content"));
CREATE INDEX "DataCenterVersion_specialties_idx" ON "DataCenterVersion" USING GIN ("specialties");
CREATE INDEX "DataCenterVersion_missionContexts_idx" ON "DataCenterVersion" USING GIN ("missionContexts");
CREATE INDEX "DataCenterEvent_itemId_createdAt_idx" ON "DataCenterEvent"("itemId", "createdAt");
CREATE INDEX "DataCenterConflict_itemId_resolvedAt_idx" ON "DataCenterConflict"("itemId", "resolvedAt");
CREATE INDEX "DataCenterConflict_otherItemId_resolvedAt_idx" ON "DataCenterConflict"("otherItemId", "resolvedAt");
CREATE INDEX "DataCenterUsage_versionId_createdAt_idx" ON "DataCenterUsage"("versionId", "createdAt");
CREATE INDEX "DataCenterUsage_actorId_createdAt_idx" ON "DataCenterUsage"("actorId", "createdAt");
CREATE INDEX "DataCenterImport_sourceId_createdAt_idx" ON "DataCenterImport"("sourceId", "createdAt");
CREATE INDEX "DataCenterAcademyRelease_status_targetKind_targetId_idx" ON "DataCenterAcademyRelease"("status", "targetKind", "targetId");

CREATE FUNCTION "data_center_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Data Center evidence, reviews, events and usage are immutable; append a new record';
END;
$$;
CREATE TRIGGER "DataCenterVersion_immutable" BEFORE UPDATE OR DELETE ON "DataCenterVersion" FOR EACH ROW EXECUTE FUNCTION "data_center_immutable"();
CREATE TRIGGER "DataCenterReview_immutable" BEFORE UPDATE OR DELETE ON "DataCenterReview" FOR EACH ROW EXECUTE FUNCTION "data_center_immutable"();
CREATE TRIGGER "DataCenterEvent_immutable" BEFORE UPDATE OR DELETE ON "DataCenterEvent" FOR EACH ROW EXECUTE FUNCTION "data_center_immutable"();
CREATE TRIGGER "DataCenterUsage_immutable" BEFORE UPDATE OR DELETE ON "DataCenterUsage" FOR EACH ROW EXECUTE FUNCTION "data_center_immutable"();
CREATE TRIGGER "DataCenterImport_immutable" BEFORE UPDATE OR DELETE ON "DataCenterImport" FOR EACH ROW EXECUTE FUNCTION "data_center_immutable"();

INSERT INTO "DataCenterType" ("key", "label", "layer") VALUES
  ('dataset', 'Structured dataset', 'DATA'),
  ('document', 'Document', 'DATA'),
  ('geojson', 'Geospatial features (WGS84)', 'DATA'),
  ('knowledge', 'Reviewed source knowledge', 'KNOWLEDGE'),
  ('academy-source', 'Approved Academy source knowledge', 'KNOWLEDGE'),
  ('analysis', 'Analytical intelligence', 'INTELLIGENCE'),
  ('generated-material', 'Generated proposal (not source knowledge)', 'INTELLIGENCE'),
  ('context', 'Mission context', 'CONTEXT');
