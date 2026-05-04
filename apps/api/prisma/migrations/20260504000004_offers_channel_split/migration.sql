-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('B2C', 'B2B');

-- CreateTable: SystemOffersSettings
CREATE TABLE "SystemOffersSettings" (
    "id" SERIAL NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "minNights" INTEGER,
    "maxNights" INTEGER,
    "minRooms" INTEGER,
    "maxRooms" INTEGER,
    "allowedCancellationPolicies" TEXT,
    "allowedBoardTypes" TEXT,
    "allowedChargeParties" TEXT,
    "allowedPaymentMethods" TEXT,
    "minOfferValue" DECIMAL(65,30),
    "minOfferCurrency" TEXT,
    "bookingMode" TEXT,
    "multiRoomLimitBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemOffersSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: SystemOffersSettings.channel unique
CREATE UNIQUE INDEX "SystemOffersSettings_channel_key" ON "SystemOffersSettings"("channel");

-- AlterTable: OrgOffersSettings — drop old unique index, add channel column, new composite unique
DROP INDEX IF EXISTS "OrgOffersSettings_organizationId_key";
ALTER TABLE "OrgOffersSettings" ADD COLUMN "channel" "ChannelType" NOT NULL DEFAULT 'B2C';
CREATE UNIQUE INDEX "OrgOffersSettings_organizationId_channel_key" ON "OrgOffersSettings"("organizationId", "channel");

-- AlterTable: PropertyOffersSettings — drop old unique index, add channel column, new composite unique
DROP INDEX IF EXISTS "PropertyOffersSettings_propertyId_key";
ALTER TABLE "PropertyOffersSettings" ADD COLUMN "channel" "ChannelType" NOT NULL DEFAULT 'B2C';
CREATE UNIQUE INDEX "PropertyOffersSettings_propertyId_channel_key" ON "PropertyOffersSettings"("propertyId", "channel");
