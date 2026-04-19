-- AlterTable
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "childMaxAge" INTEGER;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "infantMaxAge" INTEGER;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "roomRatesDefaultExpanded" BOOLEAN;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "searchResultsCarouselInterval" INTEGER;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "searchResultsImageMode" TEXT;
ALTER TABLE "OrgDesignDefaults" ADD COLUMN "searchResultsImageUrl" TEXT;

-- CreateTable
CREATE TABLE "OrgNavItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrgNavItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OrgNavItem_organizationId_section_idx" ON "OrgNavItem"("organizationId", "section");
