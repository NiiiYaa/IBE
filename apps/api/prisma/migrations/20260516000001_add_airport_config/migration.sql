-- CreateTable
CREATE TABLE "SystemAirportConfig" (
    "id" SERIAL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "radiusKm" INTEGER NOT NULL DEFAULT 100,
    "maxCount" INTEGER NOT NULL DEFAULT 3,
    "airportDataset" JSONB,
    "airportDatasetUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemAirportConfig_pkey" PRIMARY KEY ("id")
);

-- Migrate airport data from SystemWLConfig into new SystemAirportConfig
INSERT INTO "SystemAirportConfig" ("enabled", "radiusKm", "maxCount", "airportDataset", "airportDatasetUpdatedAt", "createdAt", "updatedAt")
SELECT
  false,
  COALESCE("airportRadiusKm", 100),
  COALESCE("airportMaxCount", 3),
  "airportDataset",
  "airportDatasetUpdatedAt",
  NOW(),
  NOW()
FROM "SystemWLConfig"
LIMIT 1;

-- CreateTable
CREATE TABLE "OrgAirportConfig" (
    "id" SERIAL,
    "organizationId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "radiusKm" INTEGER,
    "maxCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgAirportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyAirportConfig" (
    "id" SERIAL,
    "propertyId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "radiusKm" INTEGER,
    "maxCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyAirportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgAirportConfig_organizationId_key" ON "OrgAirportConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAirportConfig_propertyId_key" ON "PropertyAirportConfig"("propertyId");

-- AddForeignKey
ALTER TABLE "OrgAirportConfig" ADD CONSTRAINT "OrgAirportConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAirportConfig" ADD CONSTRAINT "PropertyAirportConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: drop airport columns from SystemWLConfig
ALTER TABLE "SystemWLConfig" DROP COLUMN "airportDataset";
ALTER TABLE "SystemWLConfig" DROP COLUMN "airportDatasetUpdatedAt";
ALTER TABLE "SystemWLConfig" DROP COLUMN "airportRadiusKm";
ALTER TABLE "SystemWLConfig" DROP COLUMN "airportMaxCount";
