-- AlterTable: replace isActive (Boolean) with status (String)
ALTER TABLE "Property" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- Backfill: map isActive=false → 'inactive', isActive=true stays 'active'
UPDATE "Property" SET status = CASE WHEN "isActive" = true THEN 'active' ELSE 'inactive' END;

-- Drop old column
ALTER TABLE "Property" DROP COLUMN "isActive";
