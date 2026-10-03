CREATE TYPE "OrganizationProgramKey" AS ENUM ('FINANCE', 'PEOPLE', 'FIELD_OPERATIONS', 'FLEET');
CREATE TYPE "OrganizationProgramStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

CREATE TABLE "OrganizationProgram" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" "OrganizationProgramKey" NOT NULL,
  "status" "OrganizationProgramStatus" NOT NULL DEFAULT 'ACTIVE',
  "settings" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationProgram_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationProgram_organizationId_key_key" ON "OrganizationProgram"("organizationId", "key");
CREATE INDEX "OrganizationProgram_organizationId_status_idx" ON "OrganizationProgram"("organizationId", "status");

ALTER TABLE "OrganizationProgram" ADD CONSTRAINT "OrganizationProgram_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;