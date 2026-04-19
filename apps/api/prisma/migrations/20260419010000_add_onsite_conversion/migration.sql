-- CreateTable
CREATE TABLE "OnsiteConversionSettings" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "presenceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "presenceMinViewers" INTEGER NOT NULL DEFAULT 3,
    "bookingsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bookingsWindowHours" INTEGER NOT NULL DEFAULT 24,
    "bookingsMinCount" INTEGER NOT NULL DEFAULT 1,
    "popupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "popupDelaySeconds" INTEGER NOT NULL DEFAULT 30,
    "popupMessage" TEXT,
    "popupPromoCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnsiteConversionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnsiteConversionSettings_organizationId_key" ON "OnsiteConversionSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "OnsiteConversionSettings" ADD CONSTRAINT "OnsiteConversionSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
