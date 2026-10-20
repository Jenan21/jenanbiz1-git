-- Additive corrective migration for the Data Center foundation.
-- The Prisma schema and the service code use two columns and one table that the earlier Data Center migrations
-- (20261017150000_platform_data_center_v1 and 20261017152000_data_center_publication_metadata) never create.
-- Those migrations are left untouched, and nothing here changes or removes an existing object.

-- Optimistic-concurrency counter of an item: every version, evidence link and conflict resolution increments it.
ALTER TABLE "DataCenterItem" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

-- Item revision that an Academy release request was made against.
ALTER TABLE "DataCenterAcademyRelease" ADD COLUMN "parentRevision" INTEGER NOT NULL DEFAULT 0;

-- Evidence and provenance references of a version. Append-only, like the other Data Center evidence records.
CREATE TABLE "DataCenterEvidenceLink" (
  "id" TEXT PRIMARY KEY,
  "versionId" TEXT NOT NULL REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT,
  "evidenceId" TEXT REFERENCES "Evidence"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('SOURCE', 'DOCUMENT', 'CALCULATION', 'HUMAN_REVIEW', 'EXISTING_EVIDENCE')),
  "reference" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "notes" TEXT,
  "linkedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterEvidenceLink_existing_evidence_check" CHECK (("kind" = 'EXISTING_EVIDENCE') = ("evidenceId" IS NOT NULL)),
  CONSTRAINT "DataCenterEvidenceLink_versionId_kind_reference_key" UNIQUE ("versionId", "kind", "reference")
);
CREATE INDEX "DataCenterEvidenceLink_evidenceId_idx" ON "DataCenterEvidenceLink"("evidenceId");
CREATE TRIGGER "DataCenterEvidenceLink_immutable" BEFORE UPDATE OR DELETE ON "DataCenterEvidenceLink" FOR EACH ROW EXECUTE FUNCTION "data_center_immutable"();
