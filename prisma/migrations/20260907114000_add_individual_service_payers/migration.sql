CREATE TYPE "ServiceCustomerType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

ALTER TABLE "MarketingCampaign" ADD COLUMN "customerType" "ServiceCustomerType" NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "Payment" ALTER COLUMN "organizationId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "payerUserId" TEXT;

CREATE INDEX "Payment_payerUserId_status_idx" ON "Payment"("payerUserId", "status");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;