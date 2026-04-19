/*
  Warnings:

  - Added the required column `organizationId` to the `PromoCode` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PromoCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL NOT NULL,
    "currency" TEXT,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "propertyId" INTEGER,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "validDateType" TEXT NOT NULL DEFAULT 'booking',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromoCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PromoCode" ("code", "createdAt", "currency", "deletedAt", "description", "discountType", "discountValue", "id", "isActive", "maxUses", "propertyId", "updatedAt", "usesCount", "validDateType", "validFrom", "validTo") SELECT "code", "createdAt", "currency", "deletedAt", "description", "discountType", "discountValue", "id", "isActive", "maxUses", "propertyId", "updatedAt", "usesCount", "validDateType", "validFrom", "validTo" FROM "PromoCode";
DROP TABLE "PromoCode";
ALTER TABLE "new_PromoCode" RENAME TO "PromoCode";
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_organizationId_idx" ON "PromoCode"("organizationId");
CREATE INDEX "PromoCode_code_idx" ON "PromoCode"("code");
CREATE INDEX "PromoCode_propertyId_idx" ON "PromoCode"("propertyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
