ALTER TABLE "SystemAirportConfig" ADD COLUMN "stripDefaultFolded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemAirportConfig" ADD COLUMN "stripAutoFoldSecs" INTEGER NOT NULL DEFAULT 0;
