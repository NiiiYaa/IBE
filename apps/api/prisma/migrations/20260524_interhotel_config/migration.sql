CREATE TABLE "SystemInterHotelConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxRadiusKm" INTEGER NOT NULL DEFAULT 50,
    "maxHotels" INTEGER NOT NULL DEFAULT 3,
    "transferType" TEXT NOT NULL DEFAULT 'self',
    "sponsoredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sponsoredCurrency" TEXT NOT NULL DEFAULT 'USD',
    "discountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incentiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "incentivePackageId" INTEGER,
    CONSTRAINT "SystemInterHotelConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgInterHotelConfig" (
    "organizationId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "maxRadiusKm" INTEGER,
    "maxHotels" INTEGER,
    "transferType" TEXT,
    "sponsoredAmount" DOUBLE PRECISION,
    "sponsoredCurrency" TEXT,
    "discountEnabled" BOOLEAN,
    "discountPercent" DOUBLE PRECISION,
    "incentiveEnabled" BOOLEAN,
    "incentivePackageId" INTEGER,
    CONSTRAINT "OrgInterHotelConfig_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "PropertyInterHotelConfig" (
    "propertyId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "maxRadiusKm" INTEGER,
    "maxHotels" INTEGER,
    "transferType" TEXT,
    "sponsoredAmount" DOUBLE PRECISION,
    "sponsoredCurrency" TEXT,
    CONSTRAINT "PropertyInterHotelConfig_pkey" PRIMARY KEY ("propertyId")
);

CREATE TABLE "NearbyHotel" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "nearbyPropertyId" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NearbyHotel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NearbyHotel_propertyId_nearbyPropertyId_key" ON "NearbyHotel"("propertyId", "nearbyPropertyId");

ALTER TABLE "OrgInterHotelConfig" ADD CONSTRAINT "OrgInterHotelConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PropertyInterHotelConfig" ADD CONSTRAINT "PropertyInterHotelConfig_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NearbyHotel" ADD CONSTRAINT "NearbyHotel_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NearbyHotel" ADD CONSTRAINT "NearbyHotel_nearbyPropertyId_fkey"
  FOREIGN KEY ("nearbyPropertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
