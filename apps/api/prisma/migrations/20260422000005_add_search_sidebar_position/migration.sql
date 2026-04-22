-- AlterTable
ALTER TABLE "HotelConfig" ADD COLUMN "searchSidebarPosition" TEXT NOT NULL DEFAULT 'left';

-- AlterTable
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "searchSidebarPosition" TEXT;
