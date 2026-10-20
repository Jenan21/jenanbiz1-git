-- DataCenterAcademyRelease.parentRevision is reserved and unused in Data Center v1.
-- Existing rows only hold the former placeholder default 0, which never described a real parent revision.
ALTER TABLE "DataCenterAcademyRelease" ALTER COLUMN "parentRevision" DROP NOT NULL;
ALTER TABLE "DataCenterAcademyRelease" ALTER COLUMN "parentRevision" DROP DEFAULT;
UPDATE "DataCenterAcademyRelease" SET "parentRevision" = NULL;
