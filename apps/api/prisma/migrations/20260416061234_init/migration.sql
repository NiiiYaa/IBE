-- CreateTable
CREATE TABLE "Booking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hyperGuestBookingId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "checkIn" DATETIME NOT NULL,
    "checkOut" DATETIME NOT NULL,
    "leadGuestFirstName" TEXT NOT NULL,
    "leadGuestLastName" TEXT NOT NULL,
    "leadGuestEmail" TEXT NOT NULL,
    "totalAmount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "agencyReference" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "paymentFlow" TEXT NOT NULL,
    "stripeIntentId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "rawResponse" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BookingRoom" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookingId" INTEGER NOT NULL,
    "hyperGuestItemId" INTEGER NOT NULL,
    "roomCode" TEXT NOT NULL,
    "rateCode" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "propertyReference" TEXT,
    CONSTRAINT "BookingRoom_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" INTEGER NOT NULL,
    "checkIn" DATETIME NOT NULL,
    "checkOut" DATETIME NOT NULL,
    "guestsParam" TEXT NOT NULL,
    "nationality" TEXT,
    "currency" TEXT,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL NOT NULL,
    "currency" TEXT,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "propertyId" INTEGER,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HotelConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "propertyId" INTEGER NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "enabledLocales" TEXT NOT NULL DEFAULT 'en',
    "enabledCurrencies" TEXT NOT NULL DEFAULT 'EUR',
    "brandPrimaryColor" TEXT,
    "brandLogoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payAtHotelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payAtHotelCardGuaranteeRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StripePaymentRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bookingId" INTEGER,
    "stripeIntentId" TEXT NOT NULL,
    "stripeIntentType" TEXT NOT NULL,
    "paymentFlow" TEXT NOT NULL,
    "amount" INTEGER,
    "currency" TEXT,
    "status" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StripePaymentRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_hyperGuestBookingId_key" ON "Booking"("hyperGuestBookingId");

-- CreateIndex
CREATE INDEX "Booking_propertyId_idx" ON "Booking"("propertyId");

-- CreateIndex
CREATE INDEX "Booking_leadGuestEmail_idx" ON "Booking"("leadGuestEmail");

-- CreateIndex
CREATE INDEX "Booking_agencyReference_idx" ON "Booking"("agencyReference");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE INDEX "BookingRoom_bookingId_idx" ON "BookingRoom"("bookingId");

-- CreateIndex
CREATE INDEX "SearchSession_createdAt_idx" ON "SearchSession"("createdAt");

-- CreateIndex
CREATE INDEX "SearchSession_expiresAt_idx" ON "SearchSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_code_idx" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_propertyId_idx" ON "PromoCode"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelConfig_propertyId_key" ON "HotelConfig"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentRecord_bookingId_key" ON "StripePaymentRecord"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "StripePaymentRecord_stripeIntentId_key" ON "StripePaymentRecord"("stripeIntentId");

-- CreateIndex
CREATE INDEX "StripePaymentRecord_bookingId_idx" ON "StripePaymentRecord"("bookingId");

-- CreateIndex
CREATE INDEX "StripePaymentRecord_stripeIntentId_idx" ON "StripePaymentRecord"("stripeIntentId");
