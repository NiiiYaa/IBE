-- CreateTable
CREATE TABLE "OrgDesignDefaults" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "colorPrimary" TEXT,
    "colorPrimaryHover" TEXT,
    "colorPrimaryLight" TEXT,
    "colorAccent" TEXT,
    "colorBackground" TEXT,
    "colorSurface" TEXT,
    "colorText" TEXT,
    "colorTextMuted" TEXT,
    "colorBorder" TEXT,
    "colorSuccess" TEXT,
    "colorError" TEXT,
    "fontFamily" TEXT,
    "borderRadius" INTEGER,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "displayName" TEXT,
    "tagline" TEXT,
    "tabTitle" TEXT,
    "defaultCurrency" TEXT,
    "defaultLocale" TEXT,
    "textDirection" TEXT,
    "enabledLocales" TEXT,
    "enabledCurrencies" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrgDesignDefaults_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HotelConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "propertyId" INTEGER NOT NULL,
    "defaultCurrency" TEXT,
    "defaultLocale" TEXT,
    "textDirection" TEXT,
    "enabledLocales" TEXT,
    "enabledCurrencies" TEXT,
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payAtHotelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payAtHotelCardGuaranteeRequired" BOOLEAN NOT NULL DEFAULT false,
    "colorPrimary" TEXT,
    "colorPrimaryHover" TEXT,
    "colorPrimaryLight" TEXT,
    "colorAccent" TEXT,
    "colorBackground" TEXT,
    "colorSurface" TEXT,
    "colorText" TEXT,
    "colorTextMuted" TEXT,
    "colorBorder" TEXT,
    "colorSuccess" TEXT,
    "colorError" TEXT,
    "fontFamily" TEXT,
    "borderRadius" INTEGER,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "heroImageUrl" TEXT,
    "searchResultsImageUrl" TEXT,
    "displayName" TEXT,
    "tagline" TEXT,
    "tabTitle" TEXT,
    "infantMaxAge" INTEGER NOT NULL DEFAULT 2,
    "childMaxAge" INTEGER NOT NULL DEFAULT 16,
    "roomRatesDefaultExpanded" BOOLEAN NOT NULL DEFAULT false,
    "heroStyle" TEXT NOT NULL DEFAULT 'fullpage',
    "heroImageMode" TEXT NOT NULL DEFAULT 'fixed',
    "heroCarouselInterval" INTEGER NOT NULL DEFAULT 5,
    "searchResultsImageMode" TEXT NOT NULL DEFAULT 'fixed',
    "searchResultsCarouselInterval" INTEGER NOT NULL DEFAULT 5,
    "searchResultsExcludedImageIds" TEXT NOT NULL DEFAULT '[]',
    "excludedPropertyImageIds" TEXT NOT NULL DEFAULT '[]',
    "excludedRoomImageIds" TEXT NOT NULL DEFAULT '[]',
    "roomPrimaryImageIds" TEXT NOT NULL DEFAULT '{}',
    "tripadvisorHotelKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_HotelConfig" ("borderRadius", "childMaxAge", "colorAccent", "colorBackground", "colorBorder", "colorError", "colorPrimary", "colorPrimaryHover", "colorPrimaryLight", "colorSuccess", "colorSurface", "colorText", "colorTextMuted", "createdAt", "defaultCurrency", "defaultLocale", "displayName", "enabledCurrencies", "enabledLocales", "excludedPropertyImageIds", "excludedRoomImageIds", "faviconUrl", "fontFamily", "heroCarouselInterval", "heroImageMode", "heroImageUrl", "heroStyle", "id", "infantMaxAge", "isActive", "logoUrl", "onlinePaymentEnabled", "payAtHotelCardGuaranteeRequired", "payAtHotelEnabled", "propertyId", "roomPrimaryImageIds", "roomRatesDefaultExpanded", "searchResultsCarouselInterval", "searchResultsExcludedImageIds", "searchResultsImageMode", "searchResultsImageUrl", "tabTitle", "tagline", "textDirection", "tripadvisorHotelKey", "updatedAt") SELECT "borderRadius", "childMaxAge", "colorAccent", "colorBackground", "colorBorder", "colorError", "colorPrimary", "colorPrimaryHover", "colorPrimaryLight", "colorSuccess", "colorSurface", "colorText", "colorTextMuted", "createdAt", "defaultCurrency", "defaultLocale", "displayName", "enabledCurrencies", "enabledLocales", "excludedPropertyImageIds", "excludedRoomImageIds", "faviconUrl", "fontFamily", "heroCarouselInterval", "heroImageMode", "heroImageUrl", "heroStyle", "id", "infantMaxAge", "isActive", "logoUrl", "onlinePaymentEnabled", "payAtHotelCardGuaranteeRequired", "payAtHotelEnabled", "propertyId", "roomPrimaryImageIds", "roomRatesDefaultExpanded", "searchResultsCarouselInterval", "searchResultsExcludedImageIds", "searchResultsImageMode", "searchResultsImageUrl", "tabTitle", "tagline", "textDirection", "tripadvisorHotelKey", "updatedAt" FROM "HotelConfig";
DROP TABLE "HotelConfig";
ALTER TABLE "new_HotelConfig" RENAME TO "HotelConfig";
CREATE UNIQUE INDEX "HotelConfig_propertyId_key" ON "HotelConfig"("propertyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OrgDesignDefaults_organizationId_key" ON "OrgDesignDefaults"("organizationId");
