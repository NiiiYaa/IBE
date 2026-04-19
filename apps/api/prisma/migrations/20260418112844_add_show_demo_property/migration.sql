-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrgSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "propertyMode" TEXT NOT NULL DEFAULT 'single',
    "showCitySelector" BOOLEAN NOT NULL DEFAULT false,
    "showDemoProperty" BOOLEAN NOT NULL DEFAULT false,
    "rateProvider" TEXT NOT NULL DEFAULT 'frankfurter',
    "hyperGuestBearerToken" TEXT,
    "hyperGuestStaticDomain" TEXT,
    "hyperGuestSearchDomain" TEXT,
    "hyperGuestBookingDomain" TEXT,
    "webDomain" TEXT,
    "tlsCert" TEXT,
    "tlsKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrgSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrgSettings" ("createdAt", "hyperGuestBearerToken", "hyperGuestBookingDomain", "hyperGuestSearchDomain", "hyperGuestStaticDomain", "id", "organizationId", "propertyMode", "rateProvider", "showCitySelector", "tlsCert", "tlsKey", "updatedAt", "webDomain") SELECT "createdAt", "hyperGuestBearerToken", "hyperGuestBookingDomain", "hyperGuestSearchDomain", "hyperGuestStaticDomain", "id", "organizationId", "propertyMode", "rateProvider", "showCitySelector", "tlsCert", "tlsKey", "updatedAt", "webDomain" FROM "OrgSettings";
DROP TABLE "OrgSettings";
ALTER TABLE "new_OrgSettings" RENAME TO "OrgSettings";
CREATE UNIQUE INDEX "OrgSettings_organizationId_key" ON "OrgSettings"("organizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
