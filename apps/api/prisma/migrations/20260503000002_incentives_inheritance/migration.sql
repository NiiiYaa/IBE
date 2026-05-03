-- Make organizationId nullable on IncentiveItem (system level = NULL)
ALTER TABLE "IncentiveItem" ALTER COLUMN "organizationId" DROP NOT NULL;

-- Add visibility flag
ALTER TABLE "IncentiveItem" ADD COLUMN "visibleToChains" BOOLEAN NOT NULL DEFAULT false;

-- Make organizationId nullable on IncentivePackage
ALTER TABLE "IncentivePackage" ALTER COLUMN "organizationId" DROP NOT NULL;

-- Add visibility flags
ALTER TABLE "IncentivePackage" ADD COLUMN "visibleToChains" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IncentivePackage" ADD COLUMN "visibleToHotels" BOOLEAN NOT NULL DEFAULT false;

-- Update FK constraints to SET NULL on org deletion (not RESTRICT)
ALTER TABLE "IncentiveItem" DROP CONSTRAINT IF EXISTS "IncentiveItem_organizationId_fkey";
ALTER TABLE "IncentiveItem" ADD CONSTRAINT "IncentiveItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IncentivePackage" DROP CONSTRAINT IF EXISTS "IncentivePackage_organizationId_fkey";
ALTER TABLE "IncentivePackage" ADD CONSTRAINT "IncentivePackage_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
