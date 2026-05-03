-- Add enabled toggle to IncentivePropertyConfig (hotel-level master switch)
ALTER TABLE "IncentivePropertyConfig" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- Add incentivesEnabled to OrgSettings (chain-level master switch)
ALTER TABLE "OrgSettings" ADD COLUMN "incentivesEnabled" BOOLEAN NOT NULL DEFAULT true;
