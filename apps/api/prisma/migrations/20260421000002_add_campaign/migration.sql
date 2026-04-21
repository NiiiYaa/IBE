-- CreateTable
CREATE TABLE "Campaign" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "propertyId" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "commissionRate" DECIMAL(65,30),
    "discountRate" DECIMAL(65,30),
    "displayText" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBooking" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "commissionRate" DECIMAL(65,30) NOT NULL,
    "commissionAmount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBooking_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_organizationId_code_key" ON "Campaign"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- CreateIndex
CREATE INDEX "Campaign_propertyId_idx" ON "Campaign"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBooking_bookingId_key" ON "CampaignBooking"("bookingId");

-- CreateIndex
CREATE INDEX "CampaignBooking_campaignId_idx" ON "CampaignBooking"("campaignId");

-- CreateIndex
CREATE INDEX "Booking_campaignId_idx" ON "Booking"("campaignId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBooking" ADD CONSTRAINT "CampaignBooking_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBooking" ADD CONSTRAINT "CampaignBooking_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
