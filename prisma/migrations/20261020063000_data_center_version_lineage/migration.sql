-- Version lineage: real foreign keys replace a free-form list of upstream version IDs.
-- An edge reads "versionId was derived from upstreamVersionId".
CREATE TABLE "DataCenterVersionLineage" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "upstreamVersionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterVersionLineage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataCenterVersionLineage_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "DataCenterVersionLineage_upstreamVersionId_fkey" FOREIGN KEY ("upstreamVersionId") REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "DataCenterVersionLineage_distinct_check" CHECK ("versionId" <> "upstreamVersionId")
);

CREATE UNIQUE INDEX "DataCenterVersionLineage_versionId_upstreamVersionId_key" ON "DataCenterVersionLineage"("versionId", "upstreamVersionId");
CREATE INDEX "DataCenterVersionLineage_upstreamVersionId_idx" ON "DataCenterVersionLineage"("upstreamVersionId");

-- Edges may only be added to a version that nobody derives from yet. Edges are written while a version is created, so a path
-- from the new version back to itself cannot exist; this trigger enforces that invariant for any writer.
CREATE FUNCTION "data_center_lineage_acyclic"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "DataCenterVersionLineage" WHERE "upstreamVersionId" = NEW."versionId") THEN
    RAISE EXCEPTION 'Data Center lineage is fixed when a version is created; a version that others derive from cannot gain upstream links';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DataCenterVersionLineage_acyclic" BEFORE INSERT ON "DataCenterVersionLineage" FOR EACH ROW EXECUTE FUNCTION "data_center_lineage_acyclic"();
CREATE TRIGGER "DataCenterVersionLineage_immutable" BEFORE UPDATE OR DELETE ON "DataCenterVersionLineage" FOR EACH ROW EXECUTE FUNCTION "data_center_immutable"();
