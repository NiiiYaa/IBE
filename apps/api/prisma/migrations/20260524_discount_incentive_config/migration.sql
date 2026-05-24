-- Add discount/incentive config fields to SystemFlexibleDatesConfig
ALTER TABLE "SystemFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "discountEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "discountPercent"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SystemFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "incentiveEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "incentivePackageId" INTEGER;

-- Add discount/incentive config fields to OrgFlexibleDatesConfig
ALTER TABLE "OrgFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "discountEnabled"    BOOLEAN;
ALTER TABLE "OrgFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "discountPercent"    DOUBLE PRECISION;
ALTER TABLE "OrgFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "incentiveEnabled"   BOOLEAN;
ALTER TABLE "OrgFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "incentivePackageId" INTEGER;
