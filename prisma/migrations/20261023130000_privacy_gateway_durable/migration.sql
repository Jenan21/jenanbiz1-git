-- Additive Privacy-only persistence. No existing relation or role membership changes.
CREATE TABLE "PrivacyDurableJob" (
  "id" UUID PRIMARY KEY, "organizationId" UUID NOT NULL, "clientId" UUID NOT NULL,
  "packageId" UUID NOT NULL, "attemptId" UUID NOT NULL, "ownerId" UUID NOT NULL,
  "sanitizerId" UUID NOT NULL, "verifierId" UUID NOT NULL, "processorIds" UUID[] NOT NULL,
  "fence" INTEGER NOT NULL CHECK ("fence" >= 0), "revision" INTEGER NOT NULL CHECK ("revision" >= 0),
  "processing" TEXT NOT NULL CHECK ("processing" IN ('SANITIZATION_VERIFIED','REJECTED','FAILED','CANCELLED','EXPIRED')),
  "publication" TEXT NOT NULL CHECK ("publication" IN ('NOT_REQUESTED','RELEASE_AUTHORIZED','PUBLISHING','RECONCILIATION_REQUIRED','SANITIZED_PUBLISHED','PUBLICATION_BLOCKED')),
  "destruction" TEXT NOT NULL CHECK ("destruction" IN ('RAW_PRESENT','DESTRUCTION_PENDING','RAW_ACCESS_REVOKED','DESTRUCTION_VERIFYING','RAW_DESTROYED','DESTRUCTION_FAILED')),
  "policyHash" CHAR(64) NOT NULL CHECK ("policyHash" ~ '^[a-f0-9]{64}$'),
  "pinsHash" CHAR(64) NOT NULL CHECK ("pinsHash" ~ '^[a-f0-9]{64}$'),
  "inventoryHash" CHAR(64) NOT NULL CHECK ("inventoryHash" ~ '^[a-f0-9]{64}$'),
  "inventoryCount" INTEGER NOT NULL CHECK ("inventoryCount" BETWEEN 0 AND 1000),
  "artifactId" UUID NOT NULL, "objectRef" UUID NOT NULL,
  "artifactHash" CHAR(64) NOT NULL CHECK ("artifactHash" ~ '^[a-f0-9]{64}$'),
  "verificationHash" CHAR(64) NOT NULL CHECK ("verificationHash" ~ '^[a-f0-9]{64}$'),
  "rawExpiresAt" TIMESTAMPTZ(3) NOT NULL, "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CHECK ("ownerId" <> "sanitizerId" AND "ownerId" <> "verifierId" AND "sanitizerId" <> "verifierId"),
  CHECK (cardinality("processorIds") BETWEEN 1 AND 100 AND "sanitizerId"=ANY("processorIds") AND NOT ("verifierId"=ANY("processorIds"))),
  CHECK ("rawExpiresAt" > "createdAt" AND "rawExpiresAt" <= "createdAt" + INTERVAL '24 hours'),
  CHECK ("updatedAt" >= "createdAt"),
  CHECK ("publication" <> 'SANITIZED_PUBLISHED' OR "revokedAt" IS NOT NULL),
  CHECK ("destruction" NOT IN ('RAW_ACCESS_REVOKED','DESTRUCTION_VERIFYING','RAW_DESTROYED') OR "revokedAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "PrivacyDurableJob_organizationId_clientId_packageId_attemptId_key" ON "PrivacyDurableJob" ("organizationId","clientId","packageId","attemptId");
CREATE UNIQUE INDEX "PrivacyDurableJob_id_attemptId_fence_key" ON "PrivacyDurableJob" ("id","attemptId","fence");
CREATE INDEX "PrivacyDurableJob_rawExpiresAt_idx" ON "PrivacyDurableJob" ("rawExpiresAt");

CREATE TABLE "PrivacyDurableEvent" (
  "jobId" UUID NOT NULL REFERENCES "PrivacyDurableJob"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  "sequence" INTEGER NOT NULL CHECK ("sequence" >= 0), "revision" INTEGER NOT NULL CHECK ("revision" >= 0), "actorId" UUID NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('SANITIZER','VERIFIER','PUBLISHER','DESTROYER','AUDITOR')),
  "action" TEXT NOT NULL CHECK ("action" IN ('ENROLL','AUTHORIZE','CLAIM','DISPATCH','RECONCILE','PUBLISHED','REVOKE','DESTROY','DESTROYED','FAILED')),
  "result" TEXT NOT NULL CHECK ("result" IN ('ALLOWED','PENDING','FAILED','COMPLETED')),
  "intentHash" CHAR(64) NOT NULL CHECK ("intentHash" ~ '^[a-f0-9]{64}$'),
  "idempotencyKey" UUID NOT NULL,
  "previousHash" CHAR(64) NOT NULL CHECK ("previousHash" ~ '^[a-f0-9]{64}$'),
  "eventHash" CHAR(64) NOT NULL CHECK ("eventHash" ~ '^[a-f0-9]{64}$'),
  "at" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("jobId","sequence"),
  UNIQUE ("jobId","idempotencyKey"), UNIQUE ("jobId","eventHash")
);
CREATE TABLE "PrivacyDurableReceipt" (
  "id" UUID PRIMARY KEY,
  "jobId" UUID NOT NULL REFERENCES "PrivacyDurableJob"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('VERIFICATION','PUBLICATION','DESTRUCTION')),
  "hash" CHAR(64) NOT NULL CHECK ("hash" ~ '^[a-f0-9]{64}$'),
  "objectRef" UUID NOT NULL, "actorId" UUID NOT NULL, "at" TIMESTAMPTZ(3) NOT NULL,
  UNIQUE ("jobId","kind"), UNIQUE ("jobId","hash")
);
CREATE TABLE "PrivacyDurableWork" (
  "id" UUID PRIMARY KEY,
  "jobId" UUID NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PUBLICATION','DESTRUCTION')),
  "intentHash" CHAR(64) NOT NULL CHECK ("intentHash" ~ '^[a-f0-9]{64}$'),
  "idempotencyKey" UUID NOT NULL, "attemptId" UUID NOT NULL, "fence" INTEGER NOT NULL CHECK ("fence" >= 0),
  "state" TEXT NOT NULL CHECK ("state" IN ('READY','LEASED','DISPATCHED','RECONCILIATION_REQUIRED','COMPLETED','FAILED')),
  "leaseOwner" UUID, "leaseUntil" TIMESTAMPTZ(3), "tries" INTEGER NOT NULL CHECK ("tries" >= 0),
  "sourceId" TEXT CHECK ("sourceId" ~ '^[A-Za-z0-9_-]{1,128}$'),
  "itemId" TEXT CHECK ("itemId" ~ '^[A-Za-z0-9_-]{1,128}$'),
  "versionId" TEXT CHECK ("versionId" ~ '^[A-Za-z0-9_-]{1,128}$'),
  "version" INTEGER CHECK ("version" > 0),
  "checksum" CHAR(64) CHECK ("checksum" ~ '^[a-f0-9]{64}$'),
  "failure" TEXT CHECK ("failure" IN ('AUTHORIZATION_DENIED','PUBLICATION_RECONCILIATION_REQUIRED','DESTRUCTION_PENDING','DESTRUCTION_FAILED','HASH_MISMATCH','LINEAGE_MISMATCH','EXPIRED','ADAPTER_UNAVAILABLE')),
  "evidenceRef" UUID, "evidenceHash" CHAR(64) CHECK ("evidenceHash" ~ '^[a-f0-9]{64}$'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  UNIQUE ("jobId","kind"), UNIQUE ("jobId","idempotencyKey"),
  FOREIGN KEY ("jobId","attemptId","fence") REFERENCES "PrivacyDurableJob"("id","attemptId","fence") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (("leaseOwner" IS NULL) = ("leaseUntil" IS NULL)),
  CHECK ("state" <> 'LEASED' OR "leaseOwner" IS NOT NULL),
  CHECK ("state" <> 'DISPATCHED' OR "leaseOwner" IS NOT NULL),
  CHECK ("state" IN ('LEASED','DISPATCHED') OR "leaseOwner" IS NULL),
  CHECK (("sourceId" IS NULL AND "itemId" IS NULL AND "versionId" IS NULL AND "version" IS NULL AND "checksum" IS NULL) OR
    ("sourceId" IS NOT NULL AND "itemId" IS NOT NULL AND "versionId" IS NOT NULL AND "version" IS NOT NULL AND "checksum" IS NOT NULL)),
  CHECK ("state" <> 'COMPLETED' OR "evidenceRef" IS NOT NULL AND "evidenceHash" IS NOT NULL),
  CHECK ("kind" <> 'PUBLICATION' OR "state" <> 'COMPLETED' OR
    "sourceId" IS NOT NULL AND "itemId" IS NOT NULL AND "versionId" IS NOT NULL AND "version" IS NOT NULL AND "checksum" IS NOT NULL)
);
CREATE INDEX "PrivacyDurableWork_state_leaseUntil_idx" ON "PrivacyDurableWork" ("state","leaseUntil");

CREATE FUNCTION privacy_durable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_TABLE_NAME IN ('PrivacyDurableEvent','PrivacyDurableReceipt') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRIVACY_APPEND_ONLY';
  END IF;
  IF TG_TABLE_NAME = 'PrivacyDurableJob' THEN
    IF (to_jsonb(NEW) - ARRAY['revision','fence','publication','destruction','revokedAt','updatedAt'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revision','fence','publication','destruction','revokedAt','updatedAt'])
       OR NEW."revision" <> OLD."revision" + 1 OR NEW."fence" < OLD."fence"
       OR NEW."updatedAt" < OLD."updatedAt"
       OR OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
       OR OLD."destruction" = 'RAW_DESTROYED'
       OR NEW."revokedAt" IS NOT NULL AND (NEW."revokedAt" < NEW."createdAt" OR NEW."revokedAt" > NEW."updatedAt")
       OR NEW."publication" IS DISTINCT FROM OLD."publication" AND NOT (
         OLD."publication"='NOT_REQUESTED' AND NEW."publication" IN ('RELEASE_AUTHORIZED','PUBLICATION_BLOCKED') OR
         OLD."publication"='RELEASE_AUTHORIZED' AND NEW."publication" IN ('PUBLISHING','PUBLICATION_BLOCKED') OR
         OLD."publication"='PUBLISHING' AND NEW."publication" IN ('SANITIZED_PUBLISHED','RECONCILIATION_REQUIRED') OR
         OLD."publication"='RECONCILIATION_REQUIRED' AND NEW."publication" IN ('SANITIZED_PUBLISHED','PUBLICATION_BLOCKED'))
       OR NEW."destruction" IS DISTINCT FROM OLD."destruction" AND NOT (
         OLD."destruction"='RAW_PRESENT' AND NEW."destruction"='DESTRUCTION_PENDING' OR
         OLD."destruction"='DESTRUCTION_PENDING' AND NEW."destruction"='RAW_ACCESS_REVOKED' OR
         OLD."destruction"='RAW_ACCESS_REVOKED' AND NEW."destruction"='DESTRUCTION_VERIFYING' OR
         OLD."destruction"='DESTRUCTION_VERIFYING' AND NEW."destruction" IN ('RAW_DESTROYED','DESTRUCTION_FAILED') OR
         OLD."destruction"='DESTRUCTION_FAILED' AND NEW."destruction"='DESTRUCTION_PENDING') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRIVACY_IMMUTABLE_OR_STALE';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['fence','state','leaseOwner','leaseUntil','tries','sourceId','itemId','versionId','version','checksum','failure','evidenceRef','evidenceHash','updatedAt'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['fence','state','leaseOwner','leaseUntil','tries','sourceId','itemId','versionId','version','checksum','failure','evidenceRef','evidenceHash','updatedAt'])
       OR NEW."fence" < OLD."fence" OR NEW."tries" < OLD."tries" OR OLD."state" = 'COMPLETED'
       OR NEW."state" IS DISTINCT FROM OLD."state" AND NOT (
         OLD."state"='READY' AND NEW."state"='LEASED' OR
         OLD."state"='LEASED' AND NEW."state" IN ('DISPATCHED','RECONCILIATION_REQUIRED','COMPLETED','FAILED') OR
         OLD."state"='DISPATCHED' AND NEW."state" IN ('LEASED','RECONCILIATION_REQUIRED','COMPLETED') OR
         OLD."state" IN ('RECONCILIATION_REQUIRED','FAILED') AND NEW."state"='LEASED')
       OR OLD."itemId" IS NOT NULL AND (NEW."sourceId",NEW."itemId",NEW."versionId",NEW."version",NEW."checksum")
          IS DISTINCT FROM (OLD."sourceId",OLD."itemId",OLD."versionId",OLD."version",OLD."checksum") THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRIVACY_IMMUTABLE_OR_STALE';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_job_guard BEFORE UPDATE OR DELETE ON "PrivacyDurableJob" FOR EACH ROW EXECUTE FUNCTION privacy_durable_guard();
CREATE TRIGGER privacy_work_guard BEFORE UPDATE OR DELETE ON "PrivacyDurableWork" FOR EACH ROW EXECUTE FUNCTION privacy_durable_guard();
CREATE TRIGGER privacy_event_guard BEFORE UPDATE OR DELETE ON "PrivacyDurableEvent" FOR EACH ROW EXECUTE FUNCTION privacy_durable_guard();
CREATE TRIGGER privacy_receipt_guard BEFORE UPDATE OR DELETE ON "PrivacyDurableReceipt" FOR EACH ROW EXECUTE FUNCTION privacy_durable_guard();
REVOKE ALL ON FUNCTION privacy_durable_guard() FROM PUBLIC;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jenan_privacy_process') THEN CREATE ROLE jenan_privacy_process NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jenan_privacy_verify') THEN CREATE ROLE jenan_privacy_verify NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jenan_privacy_publish') THEN CREATE ROLE jenan_privacy_publish NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jenan_privacy_destroy') THEN CREATE ROLE jenan_privacy_destroy NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jenan_privacy_audit') THEN CREATE ROLE jenan_privacy_audit NOLOGIN; END IF;
END $$;
REVOKE ALL ON "PrivacyDurableJob","PrivacyDurableEvent","PrivacyDurableReceipt","PrivacyDurableWork" FROM PUBLIC;
GRANT SELECT ON "PrivacyDurableJob","PrivacyDurableEvent","PrivacyDurableReceipt","PrivacyDurableWork"
 TO jenan_privacy_process,jenan_privacy_verify,jenan_privacy_publish,jenan_privacy_destroy,jenan_privacy_audit;
GRANT INSERT ON "PrivacyDurableJob","PrivacyDurableEvent","PrivacyDurableReceipt" TO jenan_privacy_verify;
GRANT INSERT ON "PrivacyDurableEvent","PrivacyDurableReceipt","PrivacyDurableWork" TO jenan_privacy_publish,jenan_privacy_destroy;
GRANT UPDATE ("revision","fence","publication","destruction","revokedAt","updatedAt") ON "PrivacyDurableJob" TO jenan_privacy_publish;
GRANT UPDATE ("revision","fence","destruction","revokedAt","updatedAt") ON "PrivacyDurableJob" TO jenan_privacy_destroy;
GRANT UPDATE ("fence","state","leaseOwner","leaseUntil","tries","sourceId","itemId","versionId","version","checksum","failure","evidenceRef","evidenceHash","updatedAt") ON "PrivacyDurableWork" TO jenan_privacy_publish;
GRANT UPDATE ("fence","state","leaseOwner","leaseUntil","tries","failure","evidenceRef","evidenceHash","updatedAt") ON "PrivacyDurableWork" TO jenan_privacy_destroy;

ALTER TABLE "PrivacyDurableWork" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrivacyDurableReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrivacyDurableEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY privacy_event_read ON "PrivacyDurableEvent" FOR SELECT
 TO jenan_privacy_process,jenan_privacy_verify,jenan_privacy_publish,jenan_privacy_destroy,jenan_privacy_audit USING (true);
CREATE POLICY privacy_event_verify ON "PrivacyDurableEvent" FOR INSERT TO jenan_privacy_verify
 WITH CHECK ("role"='VERIFIER' AND "action"='ENROLL');
CREATE POLICY privacy_event_publish ON "PrivacyDurableEvent" FOR INSERT TO jenan_privacy_publish
 WITH CHECK ("role"='PUBLISHER' AND "action" IN ('AUTHORIZE','CLAIM','DISPATCH','RECONCILE','PUBLISHED','FAILED'));
CREATE POLICY privacy_event_destroy ON "PrivacyDurableEvent" FOR INSERT TO jenan_privacy_destroy
 WITH CHECK ("role"='DESTROYER' AND "action" IN ('CLAIM','REVOKE','DESTROY','DESTROYED','FAILED'));
CREATE POLICY privacy_work_read ON "PrivacyDurableWork" FOR SELECT
 TO jenan_privacy_process,jenan_privacy_verify,jenan_privacy_publish,jenan_privacy_destroy,jenan_privacy_audit USING (true);
CREATE POLICY privacy_work_publish_insert ON "PrivacyDurableWork" FOR INSERT TO jenan_privacy_publish WITH CHECK ("kind"='PUBLICATION');
CREATE POLICY privacy_work_publish_update ON "PrivacyDurableWork" FOR UPDATE TO jenan_privacy_publish USING ("kind"='PUBLICATION') WITH CHECK ("kind"='PUBLICATION');
CREATE POLICY privacy_work_destroy_insert ON "PrivacyDurableWork" FOR INSERT TO jenan_privacy_destroy WITH CHECK ("kind"='DESTRUCTION');
CREATE POLICY privacy_work_destroy_update ON "PrivacyDurableWork" FOR UPDATE TO jenan_privacy_destroy USING ("kind"='DESTRUCTION') WITH CHECK ("kind"='DESTRUCTION');
CREATE POLICY privacy_receipt_read ON "PrivacyDurableReceipt" FOR SELECT
 TO jenan_privacy_process,jenan_privacy_verify,jenan_privacy_publish,jenan_privacy_destroy,jenan_privacy_audit USING (true);
CREATE POLICY privacy_receipt_verify ON "PrivacyDurableReceipt" FOR INSERT TO jenan_privacy_verify WITH CHECK ("kind"='VERIFICATION');
CREATE POLICY privacy_receipt_publish ON "PrivacyDurableReceipt" FOR INSERT TO jenan_privacy_publish WITH CHECK ("kind"='PUBLICATION');
CREATE POLICY privacy_receipt_destroy ON "PrivacyDurableReceipt" FOR INSERT TO jenan_privacy_destroy WITH CHECK ("kind"='DESTRUCTION');

CREATE FUNCTION privacy_durable_event_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE prior "PrivacyDurableEvent"%ROWTYPE;
BEGIN
  PERFORM 1 FROM "PrivacyDurableJob" WHERE "id"=NEW."jobId" AND "revision"=NEW."revision" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRIVACY_AUDIT_REVISION'; END IF;
  SELECT * INTO prior FROM "PrivacyDurableEvent" WHERE "jobId"=NEW."jobId" ORDER BY "sequence" DESC LIMIT 1;
  IF (prior."sequence" IS NULL AND (NEW."sequence"<>0 OR NEW."previousHash"<>repeat('0',64)))
    OR (prior."sequence" IS NOT NULL AND
      (NEW."sequence"<>prior."sequence"+1 OR NEW."previousHash"<>prior."eventHash" OR NEW."at"<prior."at")) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRIVACY_AUDIT_CHAIN';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_event_order BEFORE INSERT ON "PrivacyDurableEvent" FOR EACH ROW EXECUTE FUNCTION privacy_durable_event_order();
REVOKE ALL ON FUNCTION privacy_durable_event_order() FROM PUBLIC;

CREATE FUNCTION privacy_durable_complete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "PrivacyDurableJob"%ROWTYPE;
BEGIN
  SELECT * INTO j FROM "PrivacyDurableJob" WHERE "id"=NEW."id";
  IF NOT EXISTS (SELECT FROM "PrivacyDurableEvent" WHERE "jobId"=j."id" AND "revision"=j."revision")
    OR NOT EXISTS (SELECT FROM "PrivacyDurableReceipt" WHERE "jobId"=j."id" AND "kind"='VERIFICATION' AND "hash"=j."verificationHash")
    OR j."publication"='SANITIZED_PUBLISHED' AND NOT EXISTS
      (SELECT FROM "PrivacyDurableReceipt" WHERE "jobId"=j."id" AND "kind"='PUBLICATION')
    OR j."destruction"='RAW_DESTROYED' AND NOT EXISTS
      (SELECT FROM "PrivacyDurableReceipt" WHERE "jobId"=j."id" AND "kind"='DESTRUCTION') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRIVACY_INCOMPLETE_RECEIPTS';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER privacy_complete_guard AFTER INSERT OR UPDATE ON "PrivacyDurableJob"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION privacy_durable_complete_guard();
REVOKE ALL ON FUNCTION privacy_durable_complete_guard() FROM PUBLIC;

CREATE FUNCTION privacy_durable_cleanup_intent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."revokedAt" IS NOT NULL AND OLD."revokedAt" IS NULL THEN
    INSERT INTO public."PrivacyDurableWork" ("id","jobId","kind","intentHash","idempotencyKey","attemptId","fence",
      "state","tries","createdAt","updatedAt")
    VALUES (gen_random_uuid(),NEW."id",'DESTRUCTION',NEW."inventoryHash",gen_random_uuid(),NEW."attemptId",
      NEW."fence",'READY',0,NEW."updatedAt",NEW."updatedAt") ON CONFLICT ("jobId","kind") DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_cleanup_intent AFTER UPDATE ON "PrivacyDurableJob" FOR EACH ROW EXECUTE FUNCTION privacy_durable_cleanup_intent();
REVOKE ALL ON FUNCTION privacy_durable_cleanup_intent() FROM PUBLIC;

CREATE FUNCTION privacy_durable_work_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w "PrivacyDurableWork"%ROWTYPE;
BEGIN
  SELECT * INTO w FROM "PrivacyDurableWork" WHERE "id"=NEW."id";
  IF w."state"='COMPLETED' AND NOT EXISTS (SELECT FROM "PrivacyDurableReceipt"
    WHERE "jobId"=w."jobId" AND "kind"=CASE WHEN w."kind"='PUBLICATION' THEN 'PUBLICATION' ELSE 'DESTRUCTION' END
      AND "hash"=w."evidenceHash" AND "objectRef"=w."evidenceRef") THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRIVACY_INCOMPLETE_WORK';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER privacy_work_complete AFTER INSERT OR UPDATE ON "PrivacyDurableWork"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION privacy_durable_work_complete();
REVOKE ALL ON FUNCTION privacy_durable_work_complete() FROM PUBLIC;
