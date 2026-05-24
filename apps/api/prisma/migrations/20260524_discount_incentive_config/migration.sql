-- Add discount/incentive config fields to SystemFlexibleDatesConfig
ALTER TABLE "SystemFlexibleDatesConfig" ADD COLUMN "discountEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemFlexibleDatesConfig" ADD COLUMN "discountPercent"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SystemFlexibleDatesConfig" ADD COLUMN "incentiveEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemFlexibleDatesConfig" ADD COLUMN "incentivePackageId" INTEGER;

-- Add discount/incentive config fields to OrgFlexibleDatesConfig
ALTER TABLE "OrgFlexibleDatesConfig" ADD COLUMN "discountEnabled"    BOOLEAN;
ALTER TABLE "OrgFlexibleDatesConfig" ADD COLUMN "discountPercent"    DOUBLE PRECISION;
ALTER TABLE "OrgFlexibleDatesConfig" ADD COLUMN "incentiveEnabled"   BOOLEAN;
ALTER TABLE "OrgFlexibleDatesConfig" ADD COLUMN "incentivePackageId" INTEGER;

-- Add discount/incentive config fields to SystemInterHotelConfig
ALTER TABLE "SystemInterHotelConfig" ADD COLUMN "discountEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemInterHotelConfig" ADD COLUMN "discountPercent"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SystemInterHotelConfig" ADD COLUMN "incentiveEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemInterHotelConfig" ADD COLUMN "incentivePackageId" INTEGER;

-- Add discount/incentive config fields to OrgInterHotelConfig
ALTER TABLE "OrgInterHotelConfig" ADD COLUMN "discountEnabled"    BOOLEAN;
ALTER TABLE "OrgInterHotelConfig" ADD COLUMN "discountPercent"    DOUBLE PRECISION;
ALTER TABLE "OrgInterHotelConfig" ADD COLUMN "incentiveEnabled"   BOOLEAN;
ALTER TABLE "OrgInterHotelConfig" ADD COLUMN "incentivePackageId" INTEGER;

-- Add discount/incentive config fields to SystemMultiCityConfig
ALTER TABLE "SystemMultiCityConfig" ADD COLUMN "discountEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemMultiCityConfig" ADD COLUMN "discountPercent"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SystemMultiCityConfig" ADD COLUMN "incentiveEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemMultiCityConfig" ADD COLUMN "incentivePackageId" INTEGER;

-- Add discount/incentive config fields to OrgMultiCityConfig
ALTER TABLE "OrgMultiCityConfig" ADD COLUMN "discountEnabled"    BOOLEAN;
ALTER TABLE "OrgMultiCityConfig" ADD COLUMN "discountPercent"    DOUBLE PRECISION;
ALTER TABLE "OrgMultiCityConfig" ADD COLUMN "incentiveEnabled"   BOOLEAN;
ALTER TABLE "OrgMultiCityConfig" ADD COLUMN "incentivePackageId" INTEGER;
