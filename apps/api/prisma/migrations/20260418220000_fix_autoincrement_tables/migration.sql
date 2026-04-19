-- Recreate PropertyItemOverride with SQLite-compatible autoincrement
DROP TABLE IF EXISTS "PropertyItemOverride";
CREATE TABLE "PropertyItemOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL
);
CREATE UNIQUE INDEX "PropertyItemOverride_entityType_entityId_propertyId_key" ON "PropertyItemOverride"("entityType", "entityId", "propertyId");
CREATE INDEX "PropertyItemOverride_entityType_propertyId_idx" ON "PropertyItemOverride"("entityType", "propertyId");

-- Recreate OrgNavItemOverride with SQLite-compatible autoincrement
DROP TABLE IF EXISTS "OrgNavItemOverride";
CREATE TABLE "OrgNavItemOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orgNavItemId" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL
);
CREATE UNIQUE INDEX "OrgNavItemOverride_orgNavItemId_propertyId_key" ON "OrgNavItemOverride"("orgNavItemId", "propertyId");
CREATE INDEX "OrgNavItemOverride_propertyId_idx" ON "OrgNavItemOverride"("propertyId");
