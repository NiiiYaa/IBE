-- Add missing columns to IncentiveItem
ALTER TABLE "IncentiveItem" ADD COLUMN IF NOT EXISTS "propertyId" INTEGER;
ALTER TABLE "IncentiveItem" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "IncentiveItem" ADD COLUMN IF NOT EXISTS "visibleToHotels" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "IncentiveItem_propertyId_idx" ON "IncentiveItem"("propertyId");

-- Add missing columns to IncentivePackage
ALTER TABLE "IncentivePackage" ADD COLUMN IF NOT EXISTS "propertyId" INTEGER;
ALTER TABLE "IncentivePackage" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "IncentivePackage" ADD COLUMN IF NOT EXISTS "fontSize" TEXT NOT NULL DEFAULT 'md';
CREATE INDEX IF NOT EXISTS "IncentivePackage_propertyId_idx" ON "IncentivePackage"("propertyId");

-- Drop old property config table (replaced by slot model)
DROP TABLE IF EXISTS "IncentivePropertyConfig";

-- Create IncentiveSystemSlot
CREATE TABLE IF NOT EXISTS "IncentiveSystemSlot" (
  "slot"      TEXT      PRIMARY KEY,
  "packageId" INTEGER   REFERENCES "IncentivePackage"("id") ON DELETE SET NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create IncentiveChainSlot
CREATE TABLE IF NOT EXISTS "IncentiveChainSlot" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "slot"           TEXT    NOT NULL,
  "packageId"      INTEGER REFERENCES "IncentivePackage"("id") ON DELETE SET NULL,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId", "slot")
);
CREATE INDEX IF NOT EXISTS "IncentiveChainSlot_organizationId_idx" ON "IncentiveChainSlot"("organizationId");

-- Create IncentivePropertySlot
CREATE TABLE IF NOT EXISTS "IncentivePropertySlot" (
  "id"         SERIAL PRIMARY KEY,
  "propertyId" INTEGER NOT NULL,
  "slot"       TEXT    NOT NULL,
  "packageId"  INTEGER REFERENCES "IncentivePackage"("id") ON DELETE SET NULL,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("propertyId", "slot")
);
CREATE INDEX IF NOT EXISTS "IncentivePropertySlot_propertyId_idx" ON "IncentivePropertySlot"("propertyId");

-- Create IncentivePropertyItemOverride
CREATE TABLE IF NOT EXISTS "IncentivePropertyItemOverride" (
  "id"         SERIAL PRIMARY KEY,
  "propertyId" INTEGER NOT NULL,
  "itemId"     INTEGER NOT NULL REFERENCES "IncentiveItem"("id") ON DELETE CASCADE,
  "disabled"   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE ("propertyId", "itemId")
);
CREATE INDEX IF NOT EXISTS "IncentivePropertyItemOverride_propertyId_idx" ON "IncentivePropertyItemOverride"("propertyId");
