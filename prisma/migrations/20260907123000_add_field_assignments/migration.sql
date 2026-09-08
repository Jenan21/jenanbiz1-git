CREATE TABLE "FieldAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assigneeMemberId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
  "dueAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FieldAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FieldAssignment_organizationId_status_idx" ON "FieldAssignment"("organizationId", "status");
CREATE INDEX "FieldAssignment_assigneeMemberId_status_idx" ON "FieldAssignment"("assigneeMemberId", "status");
ALTER TABLE "FieldAssignment" ADD CONSTRAINT "FieldAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldAssignment" ADD CONSTRAINT "FieldAssignment_assigneeMemberId_fkey" FOREIGN KEY ("assigneeMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;