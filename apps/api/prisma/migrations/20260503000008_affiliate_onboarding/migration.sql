CREATE TABLE "AffiliateProfile" (
  "id"                  SERIAL PRIMARY KEY,
  "adminUserId"         INTEGER NOT NULL,

  -- Step 1 additions
  "country"             TEXT,
  "accountType"         TEXT,          -- 'individual' | 'company'

  -- Step 2A basic info
  "companyName"         TEXT,
  "websiteUrl"          TEXT,
  "primaryLanguage"     TEXT,

  -- Step 2B audience
  "audienceLocations"   JSONB NOT NULL DEFAULT '[]',
  "audienceTypes"       JSONB NOT NULL DEFAULT '[]',
  "monthlyTraffic"      TEXT,

  -- Step 2C promotion
  "promotionMethods"    JSONB NOT NULL DEFAULT '[]',
  "runsBrandedKw"       BOOLEAN,

  -- Step 2D social
  "socialInstagram"     TEXT,
  "socialTiktok"        TEXT,
  "socialYoutube"       TEXT,
  "newsletterSize"      TEXT,

  -- Step 2E experience
  "hasAffiliateExp"     BOOLEAN,
  "expIndustries"       JSONB NOT NULL DEFAULT '[]',
  "expMonthlyBookings"  TEXT,

  -- Step 3 payment
  "paymentMethod"       TEXT,
  "paymentCurrency"     TEXT,
  "taxId"               TEXT,

  -- Step 4 terms
  "termsAgreedAt"       TIMESTAMP(3),
  "termsVersion"        TEXT,

  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffiliateProfile_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE,
  CONSTRAINT "AffiliateProfile_adminUserId_key" UNIQUE ("adminUserId")
);

-- Also add country + accountType to AdminUser for fast access at login
ALTER TABLE "AdminUser"
  ADD COLUMN IF NOT EXISTS "country"     TEXT,
  ADD COLUMN IF NOT EXISTS "accountType" TEXT;
