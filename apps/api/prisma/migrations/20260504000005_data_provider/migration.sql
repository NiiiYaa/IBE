-- CreateTable: SystemDataProviderConfig
CREATE TABLE "SystemDataProviderConfig" (
    "id" SERIAL NOT NULL,
    "providerType" TEXT NOT NULL DEFAULT 'dataforseo',
    "refreshIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemDataProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrgDataProviderConfig
CREATE TABLE "OrgDataProviderConfig" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "useSystem" BOOLEAN NOT NULL DEFAULT true,
    "refreshIntervalDays" INTEGER,
    "enabled" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgDataProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PropertyDataProviderConfig
CREATE TABLE "PropertyDataProviderConfig" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "useOrg" BOOLEAN NOT NULL DEFAULT true,
    "refreshIntervalDays" INTEGER,
    "enabled" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PropertyDataProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PropertyScore
CREATE TABLE "PropertyScore" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "source" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PropertyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgDataProviderConfig_organizationId_key" ON "OrgDataProviderConfig"("organizationId");
CREATE UNIQUE INDEX "PropertyDataProviderConfig_propertyId_key" ON "PropertyDataProviderConfig"("propertyId");
CREATE UNIQUE INDEX "PropertyScore_propertyId_key" ON "PropertyScore"("propertyId");

-- AddForeignKey
ALTER TABLE "OrgDataProviderConfig" ADD CONSTRAINT "OrgDataProviderConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDataProviderConfig" ADD CONSTRAINT "PropertyDataProviderConfig_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyScore" ADD CONSTRAINT "PropertyScore_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
