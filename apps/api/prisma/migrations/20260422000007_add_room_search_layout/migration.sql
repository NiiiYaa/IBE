-- AlterTable
ALTER TABLE "HotelConfig" ADD COLUMN "roomSearchLayout" TEXT NOT NULL DEFAULT 'rows';

-- AlterTable
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "roomSearchLayout" TEXT;
