-- CreateTable
CREATE TABLE "PropertyItemOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyItemOverride_entityType_entityId_propertyId_key" ON "PropertyItemOverride"("entityType", "entityId", "propertyId");

-- CreateIndex
CREATE INDEX "PropertyItemOverride_entityType_propertyId_idx" ON "PropertyItemOverride"("entityType", "propertyId");
