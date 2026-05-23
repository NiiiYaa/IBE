ALTER TABLE "SystemPricingConfig" RENAME COLUMN "refreshIntervalDays" TO "refreshIntervalHours";
ALTER TABLE "SystemPricingConfig" ALTER COLUMN "refreshIntervalHours" SET DEFAULT 24;
UPDATE "SystemPricingConfig" SET "refreshIntervalHours" = "refreshIntervalHours" * 24;
