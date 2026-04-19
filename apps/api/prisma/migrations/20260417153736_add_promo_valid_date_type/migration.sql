-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PromoCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PromoCode" ("code", "createdAt", "currency", "description", "discountType", "discountValue", "id", "isActive", "maxUses", "propertyId", "updatedAt", "usesCount", "validFrom", "validTo") SELECT "code", "createdAt", "currency", "description", "discountType", "discountValue", "id", "isActive", "maxUses", "propertyId", "updatedAt", "usesCount", "validFrom", "validTo" FROM "PromoCode";
DROP TABLE "PromoCode";
ALTER TABLE "new_PromoCode" RENAME TO "PromoCode";
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_code_idx" ON "PromoCode"("code");
CREATE INDEX "PromoCode_propertyId_idx" ON "PromoCode"("propertyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
