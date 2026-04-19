-- CreateTable
CREATE TABLE "PropertyOnsiteConversionSettings" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "presenceEnabled" BOOLEAN,
    "presenceMinViewers" INTEGER,
    "bookingsEnabled" BOOLEAN,
    "bookingsWindowHours" INTEGER,
    "bookingsMinCount" INTEGER,
    "popupEnabled" BOOLEAN,
    "popupDelaySeconds" INTEGER,
    "popupMessage" TEXT,
    "popupPromoCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyOnsiteConversionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyOnsiteConversionSettings_propertyId_key" ON "PropertyOnsiteConversionSettings"("propertyId");
