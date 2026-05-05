-- Add openToAll to SystemDataProviderConfig
ALTER TABLE "SystemDataProviderConfig" ADD COLUMN "openToAll" BOOLEAN NOT NULL DEFAULT true;

-- Add fields to OrgDataProviderConfig
ALTER TABLE "OrgDataProviderConfig" ADD COLUMN "providerType" TEXT;
ALTER TABLE "OrgDataProviderConfig" ADD COLUMN "login" TEXT;
ALTER TABLE "OrgDataProviderConfig" ADD COLUMN "password" TEXT;
ALTER TABLE "OrgDataProviderConfig" ADD COLUMN "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false;

-- Add fields to PropertyDataProviderConfig
ALTER TABLE "PropertyDataProviderConfig" ADD COLUMN "providerType" TEXT;
ALTER TABLE "PropertyDataProviderConfig" ADD COLUMN "login" TEXT;
ALTER TABLE "PropertyDataProviderConfig" ADD COLUMN "password" TEXT;
ALTER TABLE "PropertyDataProviderConfig" ADD COLUMN "orgServiceDisabled" BOOLEAN NOT NULL DEFAULT false;
