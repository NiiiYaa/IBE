-- CreateTable
CREATE TABLE "SystemPricingConfig" (
    "id" SERIAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "openToAll" BOOLEAN NOT NULL DEFAULT true,
    "refreshIntervalDays" INTEGER NOT NULL DEFAULT 1,
    "highPricePct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "lowPricePct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "highAnomalyPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "lowAnomalyPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "dayDifferencePct" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "dayDifferenceWindow" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemPricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgPricingConfig" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
    "highPricePct" DOUBLE PRECISION,
    "lowPricePct" DOUBLE PRECISION,
    "highAnomalyPct" DOUBLE PRECISION,
    "lowAnomalyPct" DOUBLE PRECISION,
    "dayDifferencePct" DOUBLE PRECISION,
    "dayDifferenceWindow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyPricingConfig" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "orgServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
    "highPricePct" DOUBLE PRECISION,
    "lowPricePct" DOUBLE PRECISION,
    "highAnomalyPct" DOUBLE PRECISION,
    "lowAnomalyPct" DOUBLE PRECISION,
    "dayDifferencePct" DOUBLE PRECISION,
    "dayDifferenceWindow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyPricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRate" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "minSellPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "calendarColor" TEXT NOT NULL DEFAULT 'normal',
    "anomalyType" TEXT,
    "rollingAvg" DOUBLE PRECISION,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgPricingConfig_organizationId_key" ON "OrgPricingConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyPricingConfig_propertyId_key" ON "PropertyPricingConfig"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRate_propertyId_date_key" ON "DailyRate"("propertyId", "date");

-- AddForeignKey
ALTER TABLE "OrgPricingConfig" ADD CONSTRAINT "OrgPricingConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyPricingConfig" ADD CONSTRAINT "PropertyPricingConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRate" ADD CONSTRAINT "DailyRate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
