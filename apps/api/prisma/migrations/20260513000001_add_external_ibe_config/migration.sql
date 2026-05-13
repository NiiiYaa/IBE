-- CreateTable
CREATE TABLE "ExternalIBEConfig" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER,
    "propertyId" INTEGER,
    "searchTemplate" TEXT,
    "bookingTemplate" TEXT,
    "searchSampleUrls" JSONB NOT NULL DEFAULT '[]',
    "bookingSampleUrls" JSONB NOT NULL DEFAULT '[]',
    "externalHotelId" TEXT,
    "mcpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "widgetEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIBEConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIBEConfig_organizationId_key" ON "ExternalIBEConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIBEConfig_propertyId_key" ON "ExternalIBEConfig"("propertyId");

-- AddForeignKey
ALTER TABLE "ExternalIBEConfig" ADD CONSTRAINT "ExternalIBEConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIBEConfig" ADD CONSTRAINT "ExternalIBEConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE SET NULL ON UPDATE CASCADE;
