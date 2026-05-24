-- Add discount/incentive config fields to PropertyFlexibleDatesConfig (hotel can override)
ALTER TABLE "PropertyFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "discountEnabled"    BOOLEAN;
ALTER TABLE "PropertyFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "discountPercent"    DOUBLE PRECISION;
ALTER TABLE "PropertyFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "incentiveEnabled"   BOOLEAN;
ALTER TABLE "PropertyFlexibleDatesConfig" ADD COLUMN IF NOT EXISTS "incentivePackageId" INTEGER;
