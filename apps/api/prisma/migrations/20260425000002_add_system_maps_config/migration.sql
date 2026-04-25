CREATE TABLE "SystemMapsConfig" (
  "id" SERIAL NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'osm',
  "apiKey" TEXT,
  "poiRadius" INTEGER NOT NULL DEFAULT 1000,
  "poiCategories" TEXT NOT NULL DEFAULT '["restaurants","attractions","transport","shopping"]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemMapsConfig_pkey" PRIMARY KEY ("id")
);
