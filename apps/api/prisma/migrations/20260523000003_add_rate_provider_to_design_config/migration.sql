-- Add rateProvider to design config tables for System→Chain→Hotel inheritance
ALTER TABLE "SystemDesignConfig" ADD COLUMN "rateProvider" TEXT;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "rateProvider" TEXT;
ALTER TABLE "HotelConfig" ADD COLUMN "rateProvider" TEXT;
