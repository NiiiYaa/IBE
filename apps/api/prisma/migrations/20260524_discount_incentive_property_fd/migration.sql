-- Add discount/incentive config fields to PropertyFlexibleDatesConfig (hotel can override)
ALTER TABLE "PropertyFlexibleDatesConfig" ADD COLUMN "discountEnabled"    BOOLEAN;
ALTER TABLE "PropertyFlexibleDatesConfig" ADD COLUMN "discountPercent"    DOUBLE PRECISION;
ALTER TABLE "PropertyFlexibleDatesConfig" ADD COLUMN "incentiveEnabled"   BOOLEAN;
ALTER TABLE "PropertyFlexibleDatesConfig" ADD COLUMN "incentivePackageId" INTEGER;
