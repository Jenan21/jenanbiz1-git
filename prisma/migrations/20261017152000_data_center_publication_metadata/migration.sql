CREATE TABLE "DataCenterCategory" (
  "key" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "DataCenterDepartment" (
  "key" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "DataCenterType"
  ADD COLUMN "categoryKey" TEXT REFERENCES "DataCenterCategory"("key") ON DELETE RESTRICT,
  ADD COLUMN "departmentKey" TEXT REFERENCES "DataCenterDepartment"("key") ON DELETE RESTRICT;
ALTER TABLE "DataCenterSource" ADD COLUMN "sourceOrganization" TEXT;
ALTER TABLE "DataCenterVersion" ADD COLUMN "effectiveFrom" TIMESTAMP(3), ADD COLUMN "effectiveTo" TIMESTAMP(3);
ALTER TABLE "DataCenterVersion" ADD CONSTRAINT "DataCenterVersion_effective_dates_check"
  CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" < "effectiveTo");
ALTER TABLE "DataCenterItem" ADD COLUMN "publishedVersion" INTEGER;
UPDATE "DataCenterItem" SET "publishedVersion" = "currentVersion" WHERE "status" = 'PUBLISHED';
ALTER TABLE "DataCenterItem" ADD CONSTRAINT "DataCenterItem_published_version_fkey"
  FOREIGN KEY ("id", "publishedVersion") REFERENCES "DataCenterVersion"("itemId", "number") DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "DataCenterItem_publishedVersion_idx" ON "DataCenterItem"("publishedVersion");
CREATE INDEX "DataCenterType_categoryKey_departmentKey_idx" ON "DataCenterType"("categoryKey", "departmentKey");
