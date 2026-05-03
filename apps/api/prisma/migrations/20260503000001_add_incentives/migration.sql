-- CreateTable
CREATE TABLE "IncentiveItem" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentivePackage" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showOnChainPage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentivePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentivePackageItem" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IncentivePackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentivePropertyConfig" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "packageId" INTEGER NOT NULL,
    "showOnHotelPage" BOOLEAN NOT NULL DEFAULT false,
    "showOnSearchBanner" BOOLEAN NOT NULL DEFAULT false,
    "showOnSearchEmbedded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentivePropertyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncentiveItem_organizationId_idx" ON "IncentiveItem"("organizationId");

-- CreateIndex
CREATE INDEX "IncentivePackage_organizationId_idx" ON "IncentivePackage"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "IncentivePackageItem_packageId_itemId_key" ON "IncentivePackageItem"("packageId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "IncentivePropertyConfig_propertyId_key" ON "IncentivePropertyConfig"("propertyId");

-- AddForeignKey
ALTER TABLE "IncentiveItem" ADD CONSTRAINT "IncentiveItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePackage" ADD CONSTRAINT "IncentivePackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePackageItem" ADD CONSTRAINT "IncentivePackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "IncentivePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePackageItem" ADD CONSTRAINT "IncentivePackageItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "IncentiveItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePropertyConfig" ADD CONSTRAINT "IncentivePropertyConfig_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "IncentivePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
