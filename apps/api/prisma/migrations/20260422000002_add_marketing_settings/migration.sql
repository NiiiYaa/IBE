CREATE TABLE "OrgMarketingSettings" (
  "id" SERIAL NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "promoCodesModels" TEXT NOT NULL DEFAULT '["b2c","b2b"]',
  "priceComparisonModels" TEXT NOT NULL DEFAULT '["b2c","b2b"]',
  "affiliatesModels" TEXT NOT NULL DEFAULT '["b2c","b2b"]',
  "campaignsModels" TEXT NOT NULL DEFAULT '["b2c","b2b"]',
  "onsiteConversionModels" TEXT NOT NULL DEFAULT '["b2c","b2b"]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgMarketingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgMarketingSettings_organizationId_key" ON "OrgMarketingSettings"("organizationId");

ALTER TABLE "OrgMarketingSettings" ADD CONSTRAINT "OrgMarketingSettings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PropertyMarketingSettings" (
  "id" SERIAL NOT NULL,
  "propertyId" INTEGER NOT NULL,
  "promoCodesModels" TEXT,
  "priceComparisonModels" TEXT,
  "affiliatesModels" TEXT,
  "campaignsModels" TEXT,
  "onsiteConversionModels" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyMarketingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyMarketingSettings_propertyId_key" ON "PropertyMarketingSettings"("propertyId");
