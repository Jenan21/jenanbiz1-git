ALTER TABLE "MarketingCampaign" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "robotTaskId" TEXT;

CREATE UNIQUE INDEX "MarketingCampaign_paymentId_key" ON "MarketingCampaign"("paymentId");
CREATE UNIQUE INDEX "MarketingCampaign_robotTaskId_key" ON "MarketingCampaign"("robotTaskId");

ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_robotTaskId_fkey" FOREIGN KEY ("robotTaskId") REFERENCES "RobotTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;