-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrgSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "propertyMode" TEXT NOT NULL DEFAULT 'single',
    "showCitySelector" BOOLEAN NOT NULL DEFAULT false,
    "hyperGuestBearerToken" TEXT,
    "hyperGuestStaticDomain" TEXT,
    "hyperGuestSearchDomain" TEXT,
    "hyperGuestBookingDomain" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OrgSettings" ("createdAt", "hyperGuestBearerToken", "hyperGuestBookingDomain", "hyperGuestSearchDomain", "hyperGuestStaticDomain", "id", "propertyMode", "updatedAt") SELECT "createdAt", "hyperGuestBearerToken", "hyperGuestBookingDomain", "hyperGuestSearchDomain", "hyperGuestStaticDomain", "id", "propertyMode", "updatedAt" FROM "OrgSettings";
DROP TABLE "OrgSettings";
ALTER TABLE "new_OrgSettings" RENAME TO "OrgSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
