-- CreateTable
CREATE TABLE "OrgNavItemOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orgNavItemId" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgNavItemOverride_orgNavItemId_propertyId_key" ON "OrgNavItemOverride"("orgNavItemId", "propertyId");

-- CreateIndex
CREATE INDEX "OrgNavItemOverride_propertyId_idx" ON "OrgNavItemOverride"("propertyId");
