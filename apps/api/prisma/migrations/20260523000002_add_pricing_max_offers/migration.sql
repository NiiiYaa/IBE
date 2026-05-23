ALTER TABLE "SystemPricingConfig"   ADD COLUMN "maxOffersForAnalysis" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "OrgPricingConfig"      ADD COLUMN "maxOffersForAnalysis" INTEGER;
ALTER TABLE "PropertyPricingConfig" ADD COLUMN "maxOffersForAnalysis" INTEGER;
