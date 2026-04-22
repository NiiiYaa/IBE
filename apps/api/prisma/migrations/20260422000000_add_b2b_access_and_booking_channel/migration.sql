-- Add B2B booking attribution fields to Booking
ALTER TABLE "Booking" ADD COLUMN "bookingChannel" TEXT NOT NULL DEFAULT 'b2c';
ALTER TABLE "Booking" ADD COLUMN "agentOrgId" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "agentUserId" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "agentOrgName" TEXT;
ALTER TABLE "Booking" ADD COLUMN "agentUserName" TEXT;

CREATE INDEX "Booking_bookingChannel_idx" ON "Booking"("bookingChannel");
CREATE INDEX "Booking_agentOrgId_idx" ON "Booking"("agentOrgId");

-- Create OrgB2BAccess table
CREATE TABLE "OrgB2BAccess" (
    "id" SERIAL NOT NULL,
    "buyerOrgId" INTEGER NOT NULL,
    "sellerOrgId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgB2BAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgB2BAccess_buyerOrgId_sellerOrgId_key" ON "OrgB2BAccess"("buyerOrgId", "sellerOrgId");
CREATE INDEX "OrgB2BAccess_buyerOrgId_idx" ON "OrgB2BAccess"("buyerOrgId");
CREATE INDEX "OrgB2BAccess_sellerOrgId_idx" ON "OrgB2BAccess"("sellerOrgId");

ALTER TABLE "OrgB2BAccess" ADD CONSTRAINT "OrgB2BAccess_buyerOrgId_fkey"
    FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrgB2BAccess" ADD CONSTRAINT "OrgB2BAccess_sellerOrgId_fkey"
    FOREIGN KEY ("sellerOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
