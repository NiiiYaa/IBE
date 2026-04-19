-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "affiliateId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_affiliateId_idx" ON "Booking"("affiliateId");
