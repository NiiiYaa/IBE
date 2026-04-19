-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HotelConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "propertyId" INTEGER NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "enabledLocales" TEXT NOT NULL DEFAULT '["en"]',
    "enabledCurrencies" TEXT NOT NULL DEFAULT '["EUR"]',
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payAtHotelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payAtHotelCardGuaranteeRequired" BOOLEAN NOT NULL DEFAULT false,
    "colorPrimary" TEXT NOT NULL DEFAULT '#0f509e',
    "colorPrimaryHover" TEXT NOT NULL DEFAULT '#0a3a7a',
    "colorPrimaryLight" TEXT NOT NULL DEFAULT '#e8f0fb',
    "colorAccent" TEXT NOT NULL DEFAULT '#1399cd',
    "colorBackground" TEXT NOT NULL DEFAULT '#f2f3ef',
    "colorSurface" TEXT NOT NULL DEFAULT '#ffffff',
    "colorText" TEXT NOT NULL DEFAULT '#211c18',
    "colorTextMuted" TEXT NOT NULL DEFAULT '#717171',
    "colorBorder" TEXT NOT NULL DEFAULT '#e0e0e0',
    "colorSuccess" TEXT NOT NULL DEFAULT '#308c67',
    "colorError" TEXT NOT NULL DEFAULT '#de1f27',
    "fontFamily" TEXT NOT NULL DEFAULT 'Roboto',
    "borderRadius" INTEGER NOT NULL DEFAULT 8,
    "logoUrl" TEXT,
    "heroImageUrl" TEXT,
    "displayName" TEXT,
    "tagline" TEXT,
    "infantMaxAge" INTEGER NOT NULL DEFAULT 2,
    "childMaxAge" INTEGER NOT NULL DEFAULT 16,
    "roomRatesDefaultExpanded" BOOLEAN NOT NULL DEFAULT false,
    "heroStyle" TEXT NOT NULL DEFAULT 'fullpage',
    "heroImageMode" TEXT NOT NULL DEFAULT 'fixed',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_HotelConfig" ("borderRadius", "childMaxAge", "colorAccent", "colorBackground", "colorBorder", "colorError", "colorPrimary", "colorPrimaryHover", "colorPrimaryLight", "colorSuccess", "colorSurface", "colorText", "colorTextMuted", "createdAt", "defaultCurrency", "defaultLocale", "displayName", "enabledCurrencies", "enabledLocales", "fontFamily", "heroImageUrl", "id", "infantMaxAge", "isActive", "logoUrl", "onlinePaymentEnabled", "payAtHotelCardGuaranteeRequired", "payAtHotelEnabled", "propertyId", "roomRatesDefaultExpanded", "tagline", "updatedAt") SELECT "borderRadius", "childMaxAge", "colorAccent", "colorBackground", "colorBorder", "colorError", "colorPrimary", "colorPrimaryHover", "colorPrimaryLight", "colorSuccess", "colorSurface", "colorText", "colorTextMuted", "createdAt", "defaultCurrency", "defaultLocale", "displayName", "enabledCurrencies", "enabledLocales", "fontFamily", "heroImageUrl", "id", "infantMaxAge", "isActive", "logoUrl", "onlinePaymentEnabled", "payAtHotelCardGuaranteeRequired", "payAtHotelEnabled", "propertyId", "roomRatesDefaultExpanded", "tagline", "updatedAt" FROM "HotelConfig";
DROP TABLE "HotelConfig";
ALTER TABLE "new_HotelConfig" RENAME TO "HotelConfig";
CREATE UNIQUE INDEX "HotelConfig_propertyId_key" ON "HotelConfig"("propertyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
