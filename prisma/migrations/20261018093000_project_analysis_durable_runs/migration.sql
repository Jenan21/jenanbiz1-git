ALTER TABLE "OperationsJob" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "Project" ADD COLUMN "creationIdempotencyKey" TEXT;
CREATE UNIQUE INDEX "Project_createdById_creationIdempotencyKey_key"
ON "Project"("createdById", "creationIdempotencyKey");
