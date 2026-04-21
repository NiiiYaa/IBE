-- Allow same email across different organizations
DROP INDEX IF EXISTS "AdminUser_email_key";

-- Composite unique: same email cannot appear twice in the same organization
CREATE UNIQUE INDEX "AdminUser_organizationId_email_key" ON "AdminUser"("organizationId", "email");
