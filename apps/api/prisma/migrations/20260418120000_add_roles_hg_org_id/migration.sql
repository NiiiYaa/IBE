-- Add hyperGuestOrgId to Organization
ALTER TABLE "Organization" ADD COLUMN "hyperGuestOrgId" TEXT;
CREATE UNIQUE INDEX "Organization_hyperGuestOrgId_key" ON "Organization"("hyperGuestOrgId");

-- Make AdminUser.organizationId nullable
-- SQLite: recreate the table
PRAGMA foreign_keys=OFF;

CREATE TABLE "AdminUser_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdminUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "AdminUser_new" SELECT * FROM "AdminUser";
DROP TABLE "AdminUser";
ALTER TABLE "AdminUser_new" RENAME TO "AdminUser";

CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE UNIQUE INDEX "AdminUser_googleId_key" ON "AdminUser"("googleId");
CREATE INDEX "AdminUser_organizationId_idx" ON "AdminUser"("organizationId");

PRAGMA foreign_keys=ON;

-- Create AdminUserProperty junction table
CREATE TABLE "AdminUserProperty" (
    "adminUserId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    PRIMARY KEY ("adminUserId", "propertyId"),
    CONSTRAINT "AdminUserProperty_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminUserProperty_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
