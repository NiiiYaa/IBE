-- CreateTable
CREATE TABLE "NavItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "NavItem_propertyId_section_idx" ON "NavItem"("propertyId", "section");
