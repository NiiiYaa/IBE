-- Affiliate Phase 2: marketplace opt-in, affiliate status, AdminUser affiliate link + email verification

-- OrgSettings: chain-level marketplace defaults
ALTER TABLE "OrgSettings" ADD COLUMN "affiliateMarketplace" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrgSettings" ADD COLUMN "affiliateDefaultCommissionRate" DECIMAL(65,30);

-- HotelConfig: hotel-level overrides (NULL = inherit from chain)
ALTER TABLE "HotelConfig" ADD COLUMN "affiliateMarketplace" BOOLEAN;
ALTER TABLE "HotelConfig" ADD COLUMN "affiliateDefaultCommissionRate" DECIMAL(65,30);

-- Affiliate: status for marketplace join lifecycle
ALTER TABLE "Affiliate" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- AdminUser: affiliate link + email verification for self-registration
ALTER TABLE "AdminUser" ADD COLUMN "affiliateId" INTEGER;
ALTER TABLE "AdminUser" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AdminUser" ADD COLUMN "emailVerifyToken" TEXT;

CREATE UNIQUE INDEX "AdminUser_emailVerifyToken_key" ON "AdminUser"("emailVerifyToken");
CREATE UNIQUE INDEX "AdminUser_affiliateId_key" ON "AdminUser"("affiliateId");

ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
