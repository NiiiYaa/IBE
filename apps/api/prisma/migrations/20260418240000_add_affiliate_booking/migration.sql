-- Add discount fields to Affiliate
ALTER TABLE "Affiliate" ADD COLUMN "discountRate" DECIMAL;
ALTER TABLE "Affiliate" ADD COLUMN "displayText" TEXT;

-- AffiliateBooking table
CREATE TABLE "AffiliateBooking" (
    "id"               INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookingId"        INTEGER NOT NULL,
    "affiliateId"      INTEGER NOT NULL,
    "commissionRate"   DECIMAL NOT NULL,
    "commissionAmount" DECIMAL NOT NULL,
    "currency"         TEXT    NOT NULL,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateBooking_bookingId_fkey"   FOREIGN KEY ("bookingId")   REFERENCES "Booking"   ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffiliateBooking_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AffiliateBooking_bookingId_key" ON "AffiliateBooking"("bookingId");
CREATE INDEX "AffiliateBooking_affiliateId_idx" ON "AffiliateBooking"("affiliateId");
