-- CreateTable: SystemCompSetConfig
CREATE TABLE IF NOT EXISTS "SystemCompSetConfig" (
    "id" SERIAL NOT NULL,
    "maxCompetitorsPerProperty" INTEGER NOT NULL DEFAULT 5,
    "cronSchedule" TEXT NOT NULL DEFAULT '0 3 * * *',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemCompSetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompSetSearchParam
CREATE TABLE IF NOT EXISTS "CompSetSearchParam" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER,
    "propertyId" INTEGER,
    "offsetDays" INTEGER NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompSetSearchParam_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompSetCompetitor
CREATE TABLE IF NOT EXISTS "CompSetCompetitor" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "searchUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastFetchAt" TIMESTAMP(3),
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompSetCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompSetResult
CREATE TABLE IF NOT EXISTS "CompSetResult" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "competitorId" INTEGER,
    "searchParamId" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "checkIn" TEXT NOT NULL,
    "checkOut" TEXT NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL,
    "searchStatus" TEXT NOT NULL,
    "roomName" TEXT,
    "board" TEXT,
    "cancellation" TEXT,
    "pricePerNight" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompSetResult_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: CompSetSearchParam.orgId
ALTER TABLE "CompSetSearchParam" ADD CONSTRAINT "CompSetSearchParam_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompSetSearchParam.propertyId
ALTER TABLE "CompSetSearchParam" ADD CONSTRAINT "CompSetSearchParam_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompSetCompetitor.propertyId
ALTER TABLE "CompSetCompetitor" ADD CONSTRAINT "CompSetCompetitor_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompSetResult.propertyId
ALTER TABLE "CompSetResult" ADD CONSTRAINT "CompSetResult_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompSetResult.competitorId
ALTER TABLE "CompSetResult" ADD CONSTRAINT "CompSetResult_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "CompSetCompetitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompSetResult.searchParamId
ALTER TABLE "CompSetResult" ADD CONSTRAINT "CompSetResult_searchParamId_fkey"
    FOREIGN KEY ("searchParamId") REFERENCES "CompSetSearchParam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
