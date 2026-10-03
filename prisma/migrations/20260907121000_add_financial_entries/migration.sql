CREATE TYPE "FinancialEntryType" AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE "FinancialEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "FinancialEntryType" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'SAR',
  "description" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialEntry_organizationId_occurredAt_idx" ON "FinancialEntry"("organizationId", "occurredAt");
CREATE INDEX "FinancialEntry_organizationId_type_idx" ON "FinancialEntry"("organizationId", "type");
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;