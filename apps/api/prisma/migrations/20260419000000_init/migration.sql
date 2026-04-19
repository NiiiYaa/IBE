-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "hyperGuestOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUserProperty" (
    "adminUserId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,

    CONSTRAINT "AdminUserProperty_pkey" PRIMARY KEY ("adminUserId","propertyId")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "hyperGuestBookingId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "leadGuestFirstName" TEXT NOT NULL,
    "leadGuestLastName" TEXT NOT NULL,
    "leadGuestEmail" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "agencyReference" TEXT,
    "affiliateId" TEXT,
    "promoCode" TEXT,
    "promoDiscountPct" DECIMAL(65,30),
    "originalPrice" DECIMAL(65,30),
    "cancellationDeadline" TIMESTAMP(3),
    "paymentMethod" TEXT NOT NULL,
    "paymentFlow" TEXT NOT NULL,
    "stripeIntentId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "nationality" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "resetToken" TEXT,
    "resetTokenExp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestNote" (
    "id" SERIAL NOT NULL,
    "guestId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "authorName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affiliate" (
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

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateBooking" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "commissionRate" DECIMAL(65,30) NOT NULL,
    "commissionAmount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRoom" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "hyperGuestItemId" INTEGER NOT NULL,
    "roomCode" TEXT NOT NULL,
    "rateCode" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "propertyReference" TEXT,

    CONSTRAINT "BookingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSession" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "guestsParam" TEXT NOT NULL,
    "nationality" TEXT,
    "currency" TEXT,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL(65,30) NOT NULL,
    "currency" TEXT,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "propertyId" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "validDateType" TEXT NOT NULL DEFAULT 'booking',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelConfig" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "defaultCurrency" TEXT,
    "defaultLocale" TEXT,
    "textDirection" TEXT,
    "enabledLocales" TEXT,
    "enabledCurrencies" TEXT,
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payAtHotelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payAtHotelCardGuaranteeRequired" BOOLEAN NOT NULL DEFAULT false,
    "colorPrimary" TEXT,
    "colorPrimaryHover" TEXT,
    "colorPrimaryLight" TEXT,
    "colorAccent" TEXT,
    "colorBackground" TEXT,
    "colorSurface" TEXT,
    "colorText" TEXT,
    "colorTextMuted" TEXT,
    "colorBorder" TEXT,
    "colorSuccess" TEXT,
    "colorError" TEXT,
    "fontFamily" TEXT,
    "borderRadius" INTEGER,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "heroImageUrl" TEXT,
    "searchResultsImageUrl" TEXT,
    "displayName" TEXT,
    "tagline" TEXT,
    "tabTitle" TEXT,
    "infantMaxAge" INTEGER NOT NULL DEFAULT 2,
    "childMaxAge" INTEGER NOT NULL DEFAULT 16,
    "roomRatesDefaultExpanded" BOOLEAN NOT NULL DEFAULT false,
    "heroStyle" TEXT NOT NULL DEFAULT 'fullpage',
    "heroImageMode" TEXT NOT NULL DEFAULT 'fixed',
    "heroCarouselInterval" INTEGER NOT NULL DEFAULT 5,
    "searchResultsImageMode" TEXT NOT NULL DEFAULT 'fixed',
    "searchResultsCarouselInterval" INTEGER NOT NULL DEFAULT 5,
    "searchResultsExcludedImageIds" TEXT NOT NULL DEFAULT '[]',
    "excludedPropertyImageIds" TEXT NOT NULL DEFAULT '[]',
    "excludedRoomImageIds" TEXT NOT NULL DEFAULT '[]',
    "roomPrimaryImageIds" TEXT NOT NULL DEFAULT '{}',
    "tripadvisorHotelKey" TEXT,
    "priceComparisonEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripePaymentRecord" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER,
    "stripeIntentId" TEXT NOT NULL,
    "stripeIntentType" TEXT NOT NULL,
    "paymentFlow" TEXT NOT NULL,
    "amount" INTEGER,
    "currency" TEXT,
    "status" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripePaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavItem" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hyperGuestBearerToken" TEXT,
    "hyperGuestStaticDomain" TEXT,
    "hyperGuestSearchDomain" TEXT,
    "hyperGuestBookingDomain" TEXT,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgDesignDefaults" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "colorPrimary" TEXT,
    "colorPrimaryHover" TEXT,
    "colorPrimaryLight" TEXT,
    "colorAccent" TEXT,
    "colorBackground" TEXT,
    "colorSurface" TEXT,
    "colorText" TEXT,
    "colorTextMuted" TEXT,
    "colorBorder" TEXT,
    "colorSuccess" TEXT,
    "colorError" TEXT,
    "fontFamily" TEXT,
    "borderRadius" INTEGER,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "displayName" TEXT,
    "tagline" TEXT,
    "tabTitle" TEXT,
    "defaultCurrency" TEXT,
    "defaultLocale" TEXT,
    "textDirection" TEXT,
    "enabledLocales" TEXT,
    "enabledCurrencies" TEXT,
    "heroStyle" TEXT,
    "heroImageMode" TEXT,
    "heroCarouselInterval" INTEGER,
    "searchResultsImageUrl" TEXT,
    "searchResultsImageMode" TEXT,
    "searchResultsCarouselInterval" INTEGER,
    "roomRatesDefaultExpanded" BOOLEAN,
    "infantMaxAge" INTEGER,
    "childMaxAge" INTEGER,
    "onlinePaymentEnabled" BOOLEAN,
    "payAtHotelEnabled" BOOLEAN,
    "payAtHotelCardGuaranteeRequired" BOOLEAN,
    "chainHeroImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgDesignDefaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgNavItem" (
    "id" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgNavItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "propertyMode" TEXT NOT NULL DEFAULT 'single',
    "showCitySelector" BOOLEAN NOT NULL DEFAULT false,
    "showDemoProperty" BOOLEAN NOT NULL DEFAULT false,
    "rateProvider" TEXT NOT NULL DEFAULT 'frankfurter',
    "hyperGuestBearerToken" TEXT,
    "hyperGuestStaticDomain" TEXT,
    "hyperGuestSearchDomain" TEXT,
    "hyperGuestBookingDomain" TEXT,
    "webDomain" TEXT,
    "tlsCert" TEXT,
    "tlsKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationSettings" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailProvider" TEXT NOT NULL DEFAULT 'smtp',
    "emailFromName" TEXT NOT NULL DEFAULT '',
    "emailFromAddress" TEXT NOT NULL DEFAULT '',
    "emailSmtpHost" TEXT NOT NULL DEFAULT '',
    "emailSmtpPort" INTEGER NOT NULL DEFAULT 587,
    "emailSmtpUser" TEXT NOT NULL DEFAULT '',
    "emailSmtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "emailSmtpPassword" TEXT,
    "emailApiKey" TEXT,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappProvider" TEXT NOT NULL DEFAULT 'meta',
    "whatsappPhoneNumberId" TEXT NOT NULL DEFAULT '',
    "whatsappBusinessAccountId" TEXT NOT NULL DEFAULT '',
    "whatsappAccessToken" TEXT,
    "whatsappTwilioAccountSid" TEXT NOT NULL DEFAULT '',
    "whatsappTwilioAuthToken" TEXT,
    "whatsappTwilioNumber" TEXT NOT NULL DEFAULT '',
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsProvider" TEXT NOT NULL DEFAULT 'twilio',
    "smsFromNumber" TEXT NOT NULL DEFAULT '',
    "smsTwilioAccountSid" TEXT NOT NULL DEFAULT '',
    "smsTwilioAuthToken" TEXT,
    "smsVonageApiKey" TEXT NOT NULL DEFAULT '',
    "smsVonageApiSecret" TEXT,
    "smsAwsAccessKey" TEXT NOT NULL DEFAULT '',
    "smsAwsSecretKey" TEXT,
    "smsAwsRegion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRule" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "propertyId" INTEGER,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channels" TEXT NOT NULL DEFAULT '[]',
    "trigger" TEXT NOT NULL,
    "offsetValue" INTEGER NOT NULL DEFAULT 0,
    "offsetUnit" TEXT NOT NULL DEFAULT 'hours',
    "direction" TEXT NOT NULL DEFAULT 'after',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgNavItemOverride" (
    "id" SERIAL NOT NULL,
    "orgNavItemId" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL,

    CONSTRAINT "OrgNavItemOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyItemOverride" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL,

    CONSTRAINT "PropertyItemOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnsiteConversionSettings" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "presenceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "presenceMinViewers" INTEGER NOT NULL DEFAULT 3,
    "presenceMessage" TEXT NOT NULL DEFAULT '[xx] people are viewing this property right now',
    "presencePages" TEXT NOT NULL DEFAULT '["hotel","room"]',
    "bookingsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bookingsWindowHours" INTEGER NOT NULL DEFAULT 24,
    "bookingsMinCount" INTEGER NOT NULL DEFAULT 1,
    "bookingsMessage" TEXT NOT NULL DEFAULT '[xx] rooms booked in the last [hh] hours',
    "bookingsPages" TEXT NOT NULL DEFAULT '["hotel","room"]',
    "popupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "popupDelaySeconds" INTEGER NOT NULL DEFAULT 30,
    "popupMessage" TEXT,
    "popupPromoCode" TEXT,
    "popupPages" TEXT NOT NULL DEFAULT '["hotel","room"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnsiteConversionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyOnsiteConversionSettings" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "presenceEnabled" BOOLEAN,
    "presenceMinViewers" INTEGER,
    "presenceMessage" TEXT,
    "presencePages" TEXT,
    "bookingsEnabled" BOOLEAN,
    "bookingsWindowHours" INTEGER,
    "bookingsMinCount" INTEGER,
    "bookingsMessage" TEXT,
    "bookingsPages" TEXT,
    "popupEnabled" BOOLEAN,
    "popupDelaySeconds" INTEGER,
    "popupMessage" TEXT,
    "popupPromoCode" TEXT,
    "popupPages" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyOnsiteConversionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgOffersSettings" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
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

    CONSTRAINT "OrgOffersSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyOffersSettings" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
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

    CONSTRAINT "PropertyOffersSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceComparisonOta" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceComparisonOta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceComparisonCache" (
    "id" SERIAL NOT NULL,
    "otaId" INTEGER NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "price" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceComparisonCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingPixel" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "propertyId" INTEGER,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "pages" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingPixel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_hyperGuestOrgId_key" ON "Organization"("hyperGuestOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_googleId_key" ON "AdminUser"("googleId");

-- CreateIndex
CREATE INDEX "AdminUser_organizationId_idx" ON "AdminUser"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_hyperGuestBookingId_key" ON "Booking"("hyperGuestBookingId");

-- CreateIndex
CREATE INDEX "Booking_propertyId_idx" ON "Booking"("propertyId");

-- CreateIndex
CREATE INDEX "Booking_leadGuestEmail_idx" ON "Booking"("leadGuestEmail");

-- CreateIndex
CREATE INDEX "Booking_agencyReference_idx" ON "Booking"("agencyReference");

-- CreateIndex
CREATE INDEX "Booking_affiliateId_idx" ON "Booking"("affiliateId");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE INDEX "Guest_organizationId_idx" ON "Guest"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_organizationId_email_key" ON "Guest"("organizationId", "email");

-- CreateIndex
CREATE INDEX "GuestNote_guestId_idx" ON "GuestNote"("guestId");

-- CreateIndex
CREATE INDEX "Affiliate_organizationId_idx" ON "Affiliate"("organizationId");

-- CreateIndex
CREATE INDEX "Affiliate_propertyId_idx" ON "Affiliate"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_organizationId_code_key" ON "Affiliate"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateBooking_bookingId_key" ON "AffiliateBooking"("bookingId");

-- CreateIndex
CREATE INDEX "AffiliateBooking_affiliateId_idx" ON "AffiliateBooking"("affiliateId");

-- CreateIndex
CREATE INDEX "BookingRoom_bookingId_idx" ON "BookingRoom"("bookingId");

-- CreateIndex
CREATE INDEX "SearchSession_createdAt_idx" ON "SearchSession"("createdAt");

-- CreateIndex
CREATE INDEX "SearchSession_expiresAt_idx" ON "SearchSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_organizationId_idx" ON "PromoCode"("organizationId");

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

-- CreateIndex
CREATE INDEX "NavItem_propertyId_section_idx" ON "NavItem"("propertyId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "Property_propertyId_key" ON "Property"("propertyId");

-- CreateIndex
CREATE INDEX "Property_organizationId_idx" ON "Property"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgDesignDefaults_organizationId_key" ON "OrgDesignDefaults"("organizationId");

-- CreateIndex
CREATE INDEX "OrgNavItem_organizationId_section_idx" ON "OrgNavItem"("organizationId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_organizationId_key" ON "OrgSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationSettings_organizationId_key" ON "CommunicationSettings"("organizationId");

-- CreateIndex
CREATE INDEX "MessageRule_organizationId_idx" ON "MessageRule"("organizationId");

-- CreateIndex
CREATE INDEX "MessageRule_propertyId_idx" ON "MessageRule"("propertyId");

-- CreateIndex
CREATE INDEX "OrgNavItemOverride_propertyId_idx" ON "OrgNavItemOverride"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgNavItemOverride_orgNavItemId_propertyId_key" ON "OrgNavItemOverride"("orgNavItemId", "propertyId");

-- CreateIndex
CREATE INDEX "PropertyItemOverride_entityType_propertyId_idx" ON "PropertyItemOverride"("entityType", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyItemOverride_entityType_entityId_propertyId_key" ON "PropertyItemOverride"("entityType", "entityId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "OnsiteConversionSettings_organizationId_key" ON "OnsiteConversionSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyOnsiteConversionSettings_propertyId_key" ON "PropertyOnsiteConversionSettings"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgOffersSettings_organizationId_key" ON "OrgOffersSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyOffersSettings_propertyId_key" ON "PropertyOffersSettings"("propertyId");

-- CreateIndex
CREATE INDEX "PriceComparisonOta_organizationId_idx" ON "PriceComparisonOta"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceComparisonCache_cacheKey_key" ON "PriceComparisonCache"("cacheKey");

-- CreateIndex
CREATE INDEX "PriceComparisonCache_expiresAt_idx" ON "PriceComparisonCache"("expiresAt");

-- CreateIndex
CREATE INDEX "TrackingPixel_organizationId_idx" ON "TrackingPixel"("organizationId");

-- CreateIndex
CREATE INDEX "TrackingPixel_propertyId_idx" ON "TrackingPixel"("propertyId");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserProperty" ADD CONSTRAINT "AdminUserProperty_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserProperty" ADD CONSTRAINT "AdminUserProperty_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateBooking" ADD CONSTRAINT "AffiliateBooking_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateBooking" ADD CONSTRAINT "AffiliateBooking_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRoom" ADD CONSTRAINT "BookingRoom_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripePaymentRecord" ADD CONSTRAINT "StripePaymentRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgDesignDefaults" ADD CONSTRAINT "OrgDesignDefaults_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgNavItem" ADD CONSTRAINT "OrgNavItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationSettings" ADD CONSTRAINT "CommunicationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRule" ADD CONSTRAINT "MessageRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnsiteConversionSettings" ADD CONSTRAINT "OnsiteConversionSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgOffersSettings" ADD CONSTRAINT "OrgOffersSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceComparisonOta" ADD CONSTRAINT "PriceComparisonOta_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingPixel" ADD CONSTRAINT "TrackingPixel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

