-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN "propertyId" INTEGER;

-- AlterTable
ALTER TABLE "MessageRule" ADD COLUMN "propertyId" INTEGER;

-- AlterTable
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "onlinePaymentEnabled" BOOLEAN;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "payAtHotelCardGuaranteeRequired" BOOLEAN;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "payAtHotelEnabled" BOOLEAN;

-- CreateIndex
CREATE INDEX "Affiliate_propertyId_idx" ON "Affiliate"("propertyId");

-- CreateIndex
CREATE INDEX "MessageRule_propertyId_idx" ON "MessageRule"("propertyId");
