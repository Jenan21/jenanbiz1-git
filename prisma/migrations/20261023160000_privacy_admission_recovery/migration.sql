-- Privacy-only intake recovery; no existing production table is altered.
CREATE FUNCTION privacy_recovery_pins(p JSONB) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_typeof(p)='object' AND
  (p-ARRAY['sanitization','extraction','classification','tokenization','verification'])='{}'::jsonb AND
  p ?& ARRAY['sanitization','extraction','classification','tokenization','verification'] AND
  COALESCE((SELECT bool_and(jsonb_typeof(value)='object' AND
    (value-ARRAY['component','version','hash'])='{}'::jsonb AND value ?& ARRAY['component','version','hash'] AND value->>'component'=key AND
    value->>'version' ~ '^\d{1,4}\.\d{1,4}\.\d{1,4}$' AND value->>'hash' ~ '^[a-f0-9]{64}$')
    FROM jsonb_each(p)),false)
$$;
CREATE TABLE "PrivacyClientPackage" (
 "id" UUID PRIMARY KEY, "organizationId" UUID NOT NULL, "clientId" UUID NOT NULL,
 "purposeId" UUID NOT NULL, "usageBasisId" UUID NOT NULL, "policyHash" CHAR(64) NOT NULL CHECK ("policyHash" ~ '^[a-f0-9]{64}$'),
 "pins" JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 UNIQUE ("id","organizationId","clientId"),
 CHECK ("expiresAt">"createdAt" AND "expiresAt"<="createdAt"+INTERVAL '24 hours'),
 CHECK (privacy_recovery_pins("pins") IS TRUE)
);
CREATE TABLE "PrivacyAdmission" (
 "id" UUID PRIMARY KEY, "packageId" UUID NOT NULL UNIQUE, "organizationId" UUID NOT NULL, "clientId" UUID NOT NULL,
 "attemptId" UUID NOT NULL, "fence" INTEGER NOT NULL CHECK ("fence">=0), "revision" INTEGER NOT NULL CHECK ("revision">=0),
 "ownerId" UUID NOT NULL, "sanitizerId" UUID, "verifierId" UUID,
 "state" TEXT NOT NULL CHECK ("state" IN ('INTAKE_ACCEPTED','STAGING','SCAN_PENDING','SCAN_CLEAN','EXTRACTING','RAW_READY',
 'CLASSIFYING','SANITIZING','SANITIZATION_CANDIDATE_READY','SANITIZATION_VERIFICATION','SANITIZATION_VERIFIED',
 'MANUAL_PRIVACY_REVIEW_REQUIRED','FAILED','CANCELLED')),
 "media" TEXT NOT NULL CHECK ("media" IN ('CSV','ZIP')),
 "scannerVersion" TEXT NOT NULL CHECK ("scannerVersion" ~ '^[a-z0-9_.-]{1,80}$'),
 "stageAttempts" INTEGER NOT NULL CHECK ("stageAttempts" BETWEEN 0 AND 5),
 "policyHash" CHAR(64) NOT NULL CHECK ("policyHash" ~ '^[a-f0-9]{64}$'),
 "manifestHash" CHAR(64) CHECK ("manifestHash" ~ '^[a-f0-9]{64}$'),
 "candidateHash" CHAR(64) CHECK ("candidateHash" ~ '^[a-f0-9]{64}$'),
 "verificationHash" CHAR(64) CHECK ("verificationHash" ~ '^[a-f0-9]{64}$'),
 "leaseOwner" UUID, "leaseUntil" TIMESTAMPTZ(3),
 "cleanup" TEXT NOT NULL CHECK ("cleanup" IN ('NONE','PENDING','RETRY','REFERENCE_CLEANED')),
 "failure" TEXT CHECK ("failure" IN ('EXPIRED','ABANDONED','REVOKED','SCAN_FAILED','PARSER_FAILED','SANITIZATION_FAILED','VERIFICATION_FAILED','CANCELLED','ADAPTER_UNAVAILABLE')),
 "revokedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 UNIQUE ("id","packageId","organizationId","clientId","attemptId","fence"),
 FOREIGN KEY ("packageId","organizationId","clientId") REFERENCES "PrivacyClientPackage"("id","organizationId","clientId") ON DELETE RESTRICT,
 CHECK (("leaseOwner" IS NULL)=("leaseUntil" IS NULL)),
 CHECK ("expiresAt">"createdAt" AND "expiresAt"<="createdAt"+INTERVAL '24 hours'),
 CHECK ("updatedAt">="createdAt"),
 CHECK ("verifierId" IS NULL OR "verifierId"<>"ownerId" AND "verifierId" IS DISTINCT FROM "sanitizerId"),
 CHECK ("cleanup"='NONE' OR "revokedAt" IS NOT NULL)
);
CREATE INDEX "PrivacyAdmission_cleanup_expiresAt_idx" ON "PrivacyAdmission"("cleanup","expiresAt");
CREATE TABLE "PrivacyInventoryArtifact" (
 "id" UUID PRIMARY KEY, "jobId" UUID NOT NULL, "packageId" UUID NOT NULL, "organizationId" UUID NOT NULL, "clientId" UUID NOT NULL,
 "attemptId" UUID NOT NULL, "fence" INTEGER NOT NULL, "ordinal" INTEGER NOT NULL CHECK ("ordinal">=0 AND "ordinal"<1000), "parentId" UUID,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('ORIGINAL','EXTRACTED','TOKEN_MAPPING','CANDIDATE','VERIFICATION')),
 "taint" TEXT NOT NULL CHECK ("taint" IN ('RAW','SANITIZED_CANDIDATE','SAFE_RECEIPT')),
 "objectRef" UUID NOT NULL UNIQUE, "keyRef" UUID NOT NULL UNIQUE, "keyVersion" INTEGER NOT NULL CHECK ("keyVersion"=1),
 "cryptoVersion" TEXT NOT NULL CHECK ("cryptoVersion"='AES256_GCM_V1'),
 "checksum" CHAR(64) CHECK ("checksum" ~ '^[a-f0-9]{64}$'), "size" INTEGER CHECK ("size">0 AND "size"<=104857600),
 "state" TEXT NOT NULL CHECK ("state" IN ('RESERVED','COMPLETE','REVOKED')),
 "scan" TEXT NOT NULL CHECK ("scan" IN ('PENDING','CLEAN','NOT_APPLICABLE')),
 "scanHash" CHAR(64), "scannerVersion" TEXT CHECK ("scannerVersion" ~ '^[a-z0-9_.-]{1,80}$'),
 "createdAt" TIMESTAMPTZ(3) NOT NULL,
 UNIQUE ("jobId","kind","ordinal"), UNIQUE ("id","jobId"),
 FOREIGN KEY ("jobId","packageId","organizationId","clientId","attemptId","fence")
 REFERENCES "PrivacyAdmission"("id","packageId","organizationId","clientId","attemptId","fence") ON DELETE RESTRICT,
 FOREIGN KEY ("parentId","jobId") REFERENCES "PrivacyInventoryArtifact"("id","jobId") ON DELETE RESTRICT,
 CHECK ("state"<>'COMPLETE' OR "checksum" IS NOT NULL AND "size" IS NOT NULL),
 CHECK ("scan"<>'CLEAN' OR "scanHash"="checksum" AND "scanHash" IS NOT NULL AND "scannerVersion" IS NOT NULL),
 CHECK (("kind" IN ('ORIGINAL','EXTRACTED','TOKEN_MAPPING') AND "taint"='RAW') OR
 ("kind"='CANDIDATE' AND "taint"='SANITIZED_CANDIDATE') OR ("kind"='VERIFICATION' AND "taint"='SAFE_RECEIPT')),
 CHECK (("kind"='ORIGINAL')=("parentId" IS NULL))
);
CREATE TABLE "PrivacyAdmissionEvent" (
 "jobId" UUID NOT NULL REFERENCES "PrivacyAdmission"("id") ON DELETE RESTRICT, "revision" INTEGER NOT NULL,
 "key" UUID NOT NULL, "actorId" UUID NOT NULL,
 "role" TEXT NOT NULL CHECK ("role" IN ('INTAKE','SANITIZER','VERIFIER','DESTROYER','AUDITOR')),
 "result" TEXT NOT NULL CHECK ("result" IN ('COMPLETED','FAILED','RETRY')),
 "action" TEXT NOT NULL CHECK ("action" IN ('ADMIT','CLAIM','ADVANCE','CLEANUP','CLEANED')),
 "state" TEXT NOT NULL CHECK ("state" ~ '^[A-Z_]{1,64}$'),
 "intentHash" CHAR(64) NOT NULL CHECK ("intentHash" ~ '^[a-f0-9]{64}$'),
 "previousHash" CHAR(64) NOT NULL CHECK ("previousHash" ~ '^[a-f0-9]{64}$'),
 "hash" CHAR(64) NOT NULL CHECK ("hash" ~ '^[a-f0-9]{64}$'), "at" TIMESTAMPTZ(3) NOT NULL,
 PRIMARY KEY ("jobId","revision"), UNIQUE ("jobId","key")
);
CREATE FUNCTION privacy_admission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME IN ('PrivacyClientPackage','PrivacyAdmissionEvent') THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PRIVACY_APPEND_ONLY';
 END IF;
 IF TG_TABLE_NAME='PrivacyAdmission' THEN
  IF NEW."revision"<>OLD."revision"+1 OR NEW."updatedAt"<OLD."updatedAt" OR
   (to_jsonb(NEW)-ARRAY['revision','stageAttempts','sanitizerId','verifierId','state','manifestHash','candidateHash','verificationHash','leaseOwner','leaseUntil','cleanup','failure','revokedAt','updatedAt'])
   IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['revision','stageAttempts','sanitizerId','verifierId','state','manifestHash','candidateHash','verificationHash','leaseOwner','leaseUntil','cleanup','failure','revokedAt','updatedAt']) OR
   OLD."sanitizerId" IS NOT NULL AND NEW."sanitizerId" IS DISTINCT FROM OLD."sanitizerId" OR
   OLD."verifierId" IS NOT NULL AND NEW."verifierId" IS DISTINCT FROM OLD."verifierId" OR
   OLD."manifestHash" IS NOT NULL AND NEW."manifestHash" IS DISTINCT FROM OLD."manifestHash" OR
   OLD."candidateHash" IS NOT NULL AND NEW."candidateHash" IS DISTINCT FROM OLD."candidateHash" OR
   OLD."verificationHash" IS NOT NULL AND NEW."verificationHash" IS DISTINCT FROM OLD."verificationHash" OR
   OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" OR
   OLD."cleanup"<>'NONE' AND NEW."cleanup"='NONE' OR
   NEW."state" IS DISTINCT FROM OLD."state" AND NEW."state" NOT IN ('FAILED','CANCELLED','MANUAL_PRIVACY_REVIEW_REQUIRED') AND
    NEW."state" IS DISTINCT FROM (CASE OLD."state"
     WHEN 'INTAKE_ACCEPTED' THEN 'STAGING' WHEN 'STAGING' THEN 'SCAN_PENDING' WHEN 'SCAN_PENDING' THEN 'SCAN_CLEAN'
     WHEN 'SCAN_CLEAN' THEN 'EXTRACTING' WHEN 'EXTRACTING' THEN 'RAW_READY' WHEN 'RAW_READY' THEN 'CLASSIFYING'
     WHEN 'CLASSIFYING' THEN 'SANITIZING' WHEN 'SANITIZING' THEN 'SANITIZATION_CANDIDATE_READY'
     WHEN 'SANITIZATION_CANDIDATE_READY' THEN 'SANITIZATION_VERIFICATION'
     WHEN 'SANITIZATION_VERIFICATION' THEN 'SANITIZATION_VERIFIED' ELSE OLD."state" END) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PRIVACY_STALE_ADMISSION';
  END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['checksum','size','state','scan','scanHash','scannerVersion'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['checksum','size','state','scan','scanHash','scannerVersion']) OR
    OLD."state"='REVOKED' OR OLD."checksum" IS NOT NULL AND NEW."checksum" IS DISTINCT FROM OLD."checksum" OR
    OLD."scan"='CLEAN' AND (NEW."scan",NEW."scanHash",NEW."scannerVersion") IS DISTINCT FROM (OLD."scan",OLD."scanHash",OLD."scannerVersion") OR
    OLD."state"='COMPLETE' AND
      ((NEW."checksum",NEW."size") IS DISTINCT FROM (OLD."checksum",OLD."size") OR NEW."state"='RESERVED') THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PRIVACY_IMMUTABLE_ARTIFACT';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_package_guard BEFORE UPDATE OR DELETE ON "PrivacyClientPackage" FOR EACH ROW EXECUTE FUNCTION privacy_admission_guard();
CREATE TRIGGER privacy_admission_guard BEFORE UPDATE OR DELETE ON "PrivacyAdmission" FOR EACH ROW EXECUTE FUNCTION privacy_admission_guard();
CREATE TRIGGER privacy_inventory_guard BEFORE UPDATE OR DELETE ON "PrivacyInventoryArtifact" FOR EACH ROW EXECUTE FUNCTION privacy_admission_guard();
CREATE TRIGGER privacy_admission_event_guard BEFORE UPDATE OR DELETE ON "PrivacyAdmissionEvent" FOR EACH ROW EXECUTE FUNCTION privacy_admission_guard();
CREATE FUNCTION privacy_admission_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "PrivacyAdmission"%ROWTYPE;
BEGIN
 SELECT * INTO j FROM "PrivacyAdmission" WHERE "id"=NEW."id";
 IF NOT EXISTS (SELECT FROM "PrivacyAdmissionEvent" WHERE "jobId"=j."id" AND "revision"=j."revision") OR
  NOT EXISTS (SELECT FROM "PrivacyInventoryArtifact" WHERE "jobId"=j."id" AND "kind"='ORIGINAL') OR
  j."revokedAt" IS NULL AND (j."state" IN ('RAW_READY','CLASSIFYING','SANITIZING','SANITIZATION_CANDIDATE_READY','SANITIZATION_VERIFICATION','SANITIZATION_VERIFIED')
   AND (j."manifestHash" IS NULL OR NOT EXISTS (SELECT FROM "PrivacyInventoryArtifact" WHERE "jobId"=j."id" AND "kind"='EXTRACTED')
    OR EXISTS (SELECT FROM "PrivacyInventoryArtifact" WHERE "jobId"=j."id" AND "kind" IN ('ORIGINAL','EXTRACTED') AND
     ("state"<>'COMPLETE' OR "scan"<>'CLEAN' OR "scanHash" IS DISTINCT FROM "checksum"))) OR
  j."state" IN ('SANITIZATION_CANDIDATE_READY','SANITIZATION_VERIFICATION','SANITIZATION_VERIFIED') AND
   (j."candidateHash" IS NULL OR NOT EXISTS (SELECT FROM "PrivacyInventoryArtifact" WHERE "jobId"=j."id" AND "kind"='CANDIDATE' AND "state"='COMPLETE')
    OR NOT EXISTS (SELECT FROM "PrivacyInventoryArtifact" WHERE "jobId"=j."id" AND "kind"='TOKEN_MAPPING' AND "state"='COMPLETE'))) OR
  j."state"='SANITIZATION_VERIFIED' AND (j."verificationHash" IS NULL OR j."verifierId" IS NULL OR
   NOT EXISTS (SELECT FROM "PrivacyInventoryArtifact" WHERE "jobId"=j."id" AND "kind"='VERIFICATION' AND "state"='COMPLETE')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PRIVACY_INCOMPLETE_ADMISSION';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER privacy_admission_complete AFTER INSERT OR UPDATE ON "PrivacyAdmission"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION privacy_admission_complete();
CREATE FUNCTION privacy_inventory_fence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "PrivacyAdmission"%ROWTYPE;
BEGIN
 SELECT * INTO j FROM "PrivacyAdmission" WHERE "id"=NEW."jobId" FOR UPDATE;
 IF j."revokedAt" IS NOT NULL AND NEW."state"<>'REVOKED' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PRIVACY_REVOKED_INVENTORY';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_inventory_fence BEFORE INSERT OR UPDATE ON "PrivacyInventoryArtifact" FOR EACH ROW EXECUTE FUNCTION privacy_inventory_fence();
CREATE FUNCTION privacy_admission_event_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior "PrivacyAdmissionEvent"%ROWTYPE; current_revision INTEGER;
BEGIN
 SELECT "revision" INTO current_revision FROM "PrivacyAdmission" WHERE "id"=NEW."jobId" FOR UPDATE;
 SELECT * INTO prior FROM "PrivacyAdmissionEvent" WHERE "jobId"=NEW."jobId" ORDER BY "revision" DESC LIMIT 1;
 IF NEW."revision"<>current_revision OR
  (prior."revision" IS NULL AND (NEW."revision"<>0 OR NEW."previousHash"<>repeat('0',64))) OR
  (prior."revision" IS NOT NULL AND (NEW."revision"<>prior."revision"+1 OR NEW."previousHash"<>prior."hash" OR NEW."at"<prior."at")) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PRIVACY_ADMISSION_AUDIT_CHAIN';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER privacy_admission_event_order BEFORE INSERT ON "PrivacyAdmissionEvent" FOR EACH ROW EXECUTE FUNCTION privacy_admission_event_order();
CREATE FUNCTION privacy_package_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT FROM "PrivacyAdmission" WHERE "packageId"=NEW."id" AND
  "organizationId"=NEW."organizationId" AND "clientId"=NEW."clientId" AND "policyHash"=NEW."policyHash") THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PRIVACY_ORPHAN_PACKAGE';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER privacy_package_complete AFTER INSERT ON "PrivacyClientPackage"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION privacy_package_complete();
REVOKE ALL ON "PrivacyClientPackage","PrivacyAdmission","PrivacyInventoryArtifact","PrivacyAdmissionEvent" FROM PUBLIC;
GRANT SELECT ON "PrivacyClientPackage","PrivacyAdmission","PrivacyInventoryArtifact","PrivacyAdmissionEvent"
 TO jenan_privacy_process,jenan_privacy_verify,jenan_privacy_destroy,jenan_privacy_audit;
GRANT SELECT ON "PrivacyAdmission","PrivacyInventoryArtifact" TO jenan_privacy_publish;
GRANT INSERT ON "PrivacyClientPackage","PrivacyAdmission","PrivacyInventoryArtifact","PrivacyAdmissionEvent" TO jenan_privacy_process;
GRANT INSERT ON "PrivacyAdmissionEvent" TO jenan_privacy_verify,jenan_privacy_destroy;
GRANT UPDATE ("revision","stageAttempts","sanitizerId","state","manifestHash","candidateHash","leaseOwner","leaseUntil","cleanup","failure","revokedAt","updatedAt")
 ON "PrivacyAdmission" TO jenan_privacy_process;
GRANT UPDATE ("revision","stageAttempts","verifierId","state","verificationHash","leaseOwner","leaseUntil","cleanup","failure","revokedAt","updatedAt")
 ON "PrivacyAdmission" TO jenan_privacy_verify;
GRANT UPDATE ("revision","state","cleanup","failure","revokedAt","leaseOwner","leaseUntil","updatedAt")
 ON "PrivacyAdmission" TO jenan_privacy_destroy;
GRANT UPDATE ("checksum","size","state","scan","scanHash","scannerVersion") ON "PrivacyInventoryArtifact" TO jenan_privacy_process,jenan_privacy_verify;
GRANT UPDATE ("state") ON "PrivacyInventoryArtifact" TO jenan_privacy_destroy;
ALTER TABLE "PrivacyInventoryArtifact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY privacy_inventory_read ON "PrivacyInventoryArtifact" FOR SELECT
 TO jenan_privacy_process,jenan_privacy_verify,jenan_privacy_destroy,jenan_privacy_audit USING (true);
CREATE POLICY privacy_inventory_published_read ON "PrivacyInventoryArtifact" FOR SELECT
 TO jenan_privacy_publish USING ("kind" IN ('CANDIDATE','VERIFICATION') AND "state"='COMPLETE');
CREATE POLICY privacy_inventory_reserve ON "PrivacyInventoryArtifact" FOR INSERT TO jenan_privacy_process WITH CHECK ("state"='RESERVED');
CREATE POLICY privacy_inventory_process ON "PrivacyInventoryArtifact" FOR UPDATE TO jenan_privacy_process
 USING ("kind"<>'VERIFICATION') WITH CHECK ("kind"<>'VERIFICATION');
CREATE POLICY privacy_inventory_verify ON "PrivacyInventoryArtifact" FOR UPDATE TO jenan_privacy_verify
 USING ("kind"='VERIFICATION') WITH CHECK ("kind"='VERIFICATION');
CREATE POLICY privacy_inventory_destroy ON "PrivacyInventoryArtifact" FOR UPDATE TO jenan_privacy_destroy
 USING (true) WITH CHECK ("state"='REVOKED');
REVOKE ALL ON FUNCTION privacy_recovery_pins(JSONB),privacy_admission_guard(),privacy_admission_complete(),privacy_inventory_fence(),privacy_admission_event_order(),privacy_package_complete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION privacy_recovery_pins(JSONB) TO jenan_privacy_process;
