-- Explicit, time-limited, revocable robot access to Data Center sources.
-- The foreign keys to Robot, User and Mission are database-only (Prisma does not model them, to avoid back-relations on core models).
CREATE TYPE "DataCenterGrantAccess" AS ENUM ('READ', 'PROPOSE');

CREATE TABLE "DataCenterRobotGrant" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "robotId" TEXT NOT NULL,
  "principalId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "specialty" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "access" "DataCenterGrantAccess" NOT NULL DEFAULT 'READ',
  "reason" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "revokeReason" TEXT,
  CONSTRAINT "DataCenterRobotGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataCenterRobotGrant_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataCenterSource"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "DataCenterRobotGrant_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE RESTRICT,
  CONSTRAINT "DataCenterRobotGrant_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "DataCenterRobotGrant_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT,
  CONSTRAINT "DataCenterRobotGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "DataCenterRobotGrant_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "DataCenterRobotGrant_validity_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "DataCenterRobotGrant_text_check" CHECK (length(btrim("roleKey")) > 0 AND length(btrim("specialty")) > 0 AND length(btrim("reason")) > 0),
  CONSTRAINT "DataCenterRobotGrant_revocation_check" CHECK (
    ("revokedAt" IS NULL) = ("revokedById" IS NULL) AND ("revokedAt" IS NULL) = ("revokeReason" IS NULL)
  )
);

CREATE INDEX "DataCenterRobotGrant_principalId_robotId_missionId_revokedA_idx" ON "DataCenterRobotGrant"("principalId", "robotId", "missionId", "revokedAt");
CREATE INDEX "DataCenterRobotGrant_sourceId_idx" ON "DataCenterRobotGrant"("sourceId");

-- Grants are never edited or deleted. The only allowed change is the single revocation of an active grant.
CREATE FUNCTION "data_center_robot_grant_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Data Center robot grants are append-only; revoke the grant instead of deleting it';
  END IF;
  IF OLD."revokedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Data Center robot grant is already revoked';
  END IF;
  IF NEW."revokedAt" IS NULL
     OR (to_jsonb(NEW) - 'revokedAt' - 'revokedById' - 'revokeReason') IS DISTINCT FROM (to_jsonb(OLD) - 'revokedAt' - 'revokedById' - 'revokeReason') THEN
    RAISE EXCEPTION 'Data Center robot grants can only be revoked; every other field is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DataCenterRobotGrant_guard" BEFORE UPDATE OR DELETE ON "DataCenterRobotGrant" FOR EACH ROW EXECUTE FUNCTION "data_center_robot_grant_guard"();
