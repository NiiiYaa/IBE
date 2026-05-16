-- CreateTable
CREATE TABLE "SystemWLConfig" (
    "id" SERIAL,
    "channelUuid" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enforceChildCreds" BOOLEAN NOT NULL DEFAULT false,
    "airportDataset" JSONB,
    "airportDatasetUpdatedAt" TIMESTAMP(3),
    "airportRadiusKm" INTEGER NOT NULL DEFAULT 100,
    "airportMaxCount" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemWLConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgWLConfig" (
    "id" SERIAL,
    "organizationId" INTEGER NOT NULL,
    "channelUuid" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enforceChildCreds" BOOLEAN NOT NULL DEFAULT false,
    "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgWLConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyWLConfig" (
    "id" SERIAL,
    "propertyId" INTEGER NOT NULL,
    "channelUuid" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyWLConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgWLConfig_organizationId_key" ON "OrgWLConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyWLConfig_propertyId_key" ON "PropertyWLConfig"("propertyId");

-- AddForeignKey
ALTER TABLE "OrgWLConfig" ADD CONSTRAINT "OrgWLConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyWLConfig" ADD CONSTRAINT "PropertyWLConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
