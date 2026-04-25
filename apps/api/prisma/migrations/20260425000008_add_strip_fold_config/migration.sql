ALTER TABLE "SystemWeatherConfig" ADD COLUMN "stripDefaultFolded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemWeatherConfig" ADD COLUMN "stripAutoFoldSecs" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "OrgWeatherConfig" ADD COLUMN "stripDefaultFolded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrgWeatherConfig" ADD COLUMN "stripAutoFoldSecs" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "SystemEventsConfig" ADD COLUMN "stripDefaultFolded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemEventsConfig" ADD COLUMN "stripAutoFoldSecs" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "OrgEventsConfig" ADD COLUMN "stripDefaultFolded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrgEventsConfig" ADD COLUMN "stripAutoFoldSecs" INTEGER NOT NULL DEFAULT 15;
