-- Remove countryCode from CompSetSearchParam (no longer a search configuration field)
ALTER TABLE "CompSetSearchParam" DROP COLUMN IF EXISTS "countryCode";

-- Add children count and child ages (JSON array of integers, e.g. [8, 10])
ALTER TABLE "CompSetSearchParam" ADD COLUMN "children"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompSetSearchParam" ADD COLUMN "childAges" TEXT    NOT NULL DEFAULT '[]';
