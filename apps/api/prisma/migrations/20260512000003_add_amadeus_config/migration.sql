-- CreateTable
CREATE TABLE "SystemAmadeusConfig" (
    "id" SERIAL NOT NULL,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enforceSystemCreds" BOOLEAN NOT NULL DEFAULT false,
    "tokenUrl" TEXT NOT NULL DEFAULT '',
    "activitiesUrl" TEXT NOT NULL DEFAULT '',
    "radiusKm" INTEGER NOT NULL DEFAULT 10,
    "maxActivities" INTEGER NOT NULL DEFAULT 10,
    "stripLabel" TEXT NOT NULL DEFAULT 'Activities & Tours',
    "stripMode" TEXT NOT NULL DEFAULT 'separate',
    "stripDefaultFolded" BOOLEAN NOT NULL DEFAULT false,
    "stripAutoFoldSecs" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemAmadeusConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgAmadeusConfig" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enforceOrgCreds" BOOLEAN NOT NULL DEFAULT false,
    "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
    "radiusKm" INTEGER NOT NULL DEFAULT 10,
    "maxActivities" INTEGER NOT NULL DEFAULT 10,
    "stripLabel" TEXT NOT NULL DEFAULT 'Activities & Tours',
    "stripMode" TEXT NOT NULL DEFAULT 'separate',
    "stripDefaultFolded" BOOLEAN NOT NULL DEFAULT false,
    "stripAutoFoldSecs" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgAmadeusConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyAmadeusConfig" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
    "radiusKm" INTEGER,
    "maxActivities" INTEGER,
    "stripLabel" TEXT,
    "stripMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyAmadeusConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgAmadeusConfig_organizationId_key" ON "OrgAmadeusConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAmadeusConfig_propertyId_key" ON "PropertyAmadeusConfig"("propertyId");

-- AddForeignKey
ALTER TABLE "OrgAmadeusConfig" ADD CONSTRAINT "OrgAmadeusConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAmadeusConfig" ADD CONSTRAINT "PropertyAmadeusConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
