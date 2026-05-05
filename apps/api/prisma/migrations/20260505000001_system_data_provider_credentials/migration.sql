-- Add credentials to SystemDataProviderConfig
ALTER TABLE "SystemDataProviderConfig" ADD COLUMN "login" TEXT;
ALTER TABLE "SystemDataProviderConfig" ADD COLUMN "password" TEXT;
