/*
  Warnings:

  - Added the required column `organizationId` to the `CommunicationSettings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `MessageRule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `OrgSettings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `PriceComparisonOta` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Property` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Organization" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdminUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CommunicationSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailProvider" TEXT NOT NULL DEFAULT 'smtp',
    "emailFromName" TEXT NOT NULL DEFAULT '',
    "emailFromAddress" TEXT NOT NULL DEFAULT '',
    "emailSmtpHost" TEXT NOT NULL DEFAULT '',
    "emailSmtpPort" INTEGER NOT NULL DEFAULT 587,
    "emailSmtpUser" TEXT NOT NULL DEFAULT '',
    "emailSmtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "emailSmtpPassword" TEXT,
    "emailApiKey" TEXT,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappProvider" TEXT NOT NULL DEFAULT 'meta',
    "whatsappPhoneNumberId" TEXT NOT NULL DEFAULT '',
    "whatsappBusinessAccountId" TEXT NOT NULL DEFAULT '',
    "whatsappAccessToken" TEXT,
    "whatsappTwilioAccountSid" TEXT NOT NULL DEFAULT '',
    "whatsappTwilioAuthToken" TEXT,
    "whatsappTwilioNumber" TEXT NOT NULL DEFAULT '',
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsProvider" TEXT NOT NULL DEFAULT 'twilio',
    "smsFromNumber" TEXT NOT NULL DEFAULT '',
    "smsTwilioAccountSid" TEXT NOT NULL DEFAULT '',
    "smsTwilioAuthToken" TEXT,
    "smsVonageApiKey" TEXT NOT NULL DEFAULT '',
    "smsVonageApiSecret" TEXT,
    "smsAwsAccessKey" TEXT NOT NULL DEFAULT '',
    "smsAwsSecretKey" TEXT,
    "smsAwsRegion" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CommunicationSettings" ("createdAt", "emailApiKey", "emailEnabled", "emailFromAddress", "emailFromName", "emailProvider", "emailSmtpHost", "emailSmtpPassword", "emailSmtpPort", "emailSmtpSecure", "emailSmtpUser", "id", "smsAwsAccessKey", "smsAwsRegion", "smsAwsSecretKey", "smsEnabled", "smsFromNumber", "smsProvider", "smsTwilioAccountSid", "smsTwilioAuthToken", "smsVonageApiKey", "smsVonageApiSecret", "updatedAt", "whatsappAccessToken", "whatsappBusinessAccountId", "whatsappEnabled", "whatsappPhoneNumberId", "whatsappProvider", "whatsappTwilioAccountSid", "whatsappTwilioAuthToken", "whatsappTwilioNumber") SELECT "createdAt", "emailApiKey", "emailEnabled", "emailFromAddress", "emailFromName", "emailProvider", "emailSmtpHost", "emailSmtpPassword", "emailSmtpPort", "emailSmtpSecure", "emailSmtpUser", "id", "smsAwsAccessKey", "smsAwsRegion", "smsAwsSecretKey", "smsEnabled", "smsFromNumber", "smsProvider", "smsTwilioAccountSid", "smsTwilioAuthToken", "smsVonageApiKey", "smsVonageApiSecret", "updatedAt", "whatsappAccessToken", "whatsappBusinessAccountId", "whatsappEnabled", "whatsappPhoneNumberId", "whatsappProvider", "whatsappTwilioAccountSid", "whatsappTwilioAuthToken", "whatsappTwilioNumber" FROM "CommunicationSettings";
DROP TABLE "CommunicationSettings";
ALTER TABLE "new_CommunicationSettings" RENAME TO "CommunicationSettings";
CREATE UNIQUE INDEX "CommunicationSettings_organizationId_key" ON "CommunicationSettings"("organizationId");
CREATE TABLE "new_MessageRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channels" TEXT NOT NULL DEFAULT '[]',
    "trigger" TEXT NOT NULL,
    "offsetValue" INTEGER NOT NULL DEFAULT 0,
    "offsetUnit" TEXT NOT NULL DEFAULT 'hours',
    "direction" TEXT NOT NULL DEFAULT 'after',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MessageRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MessageRule" ("channels", "createdAt", "direction", "enabled", "id", "name", "offsetUnit", "offsetValue", "trigger", "updatedAt") SELECT "channels", "createdAt", "direction", "enabled", "id", "name", "offsetUnit", "offsetValue", "trigger", "updatedAt" FROM "MessageRule";
DROP TABLE "MessageRule";
ALTER TABLE "new_MessageRule" RENAME TO "MessageRule";
CREATE INDEX "MessageRule_organizationId_idx" ON "MessageRule"("organizationId");
CREATE TABLE "new_OrgSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "propertyMode" TEXT NOT NULL DEFAULT 'single',
    "showCitySelector" BOOLEAN NOT NULL DEFAULT false,
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
INSERT INTO "new_OrgSettings" ("createdAt", "hyperGuestBearerToken", "hyperGuestBookingDomain", "hyperGuestSearchDomain", "hyperGuestStaticDomain", "id", "propertyMode", "rateProvider", "showCitySelector", "tlsCert", "tlsKey", "updatedAt", "webDomain") SELECT "createdAt", "hyperGuestBearerToken", "hyperGuestBookingDomain", "hyperGuestSearchDomain", "hyperGuestStaticDomain", "id", "propertyMode", "rateProvider", "showCitySelector", "tlsCert", "tlsKey", "updatedAt", "webDomain" FROM "OrgSettings";
DROP TABLE "OrgSettings";
ALTER TABLE "new_OrgSettings" RENAME TO "OrgSettings";
CREATE UNIQUE INDEX "OrgSettings_organizationId_key" ON "OrgSettings"("organizationId");
CREATE TABLE "new_PriceComparisonOta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PriceComparisonOta_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PriceComparisonOta" ("createdAt", "id", "isEnabled", "name", "updatedAt", "url") SELECT "createdAt", "id", "isEnabled", "name", "updatedAt", "url" FROM "PriceComparisonOta";
DROP TABLE "PriceComparisonOta";
ALTER TABLE "new_PriceComparisonOta" RENAME TO "PriceComparisonOta";
CREATE INDEX "PriceComparisonOta_organizationId_idx" ON "PriceComparisonOta"("organizationId");
CREATE TABLE "new_Property" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Property" ("createdAt", "id", "isActive", "isDefault", "propertyId", "updatedAt") SELECT "createdAt", "id", "isActive", "isDefault", "propertyId", "updatedAt" FROM "Property";
DROP TABLE "Property";
ALTER TABLE "new_Property" RENAME TO "Property";
CREATE UNIQUE INDEX "Property_propertyId_key" ON "Property"("propertyId");
CREATE INDEX "Property_organizationId_idx" ON "Property"("organizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_organizationId_idx" ON "AdminUser"("organizationId");
