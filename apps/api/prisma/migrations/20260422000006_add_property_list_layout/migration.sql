-- AlterTable
ALTER TABLE "HotelConfig" ADD COLUMN "propertyListLayout" TEXT NOT NULL DEFAULT 'grid';

-- AlterTable
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "propertyListLayout" TEXT;
