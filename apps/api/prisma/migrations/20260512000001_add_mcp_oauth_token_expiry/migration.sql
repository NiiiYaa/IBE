-- AlterTable
ALTER TABLE "SystemMcpConfig" ADD COLUMN "oauthTokenExpiryDays" INTEGER;

-- AlterTable
ALTER TABLE "OrgMcpConfig" ADD COLUMN "oauthTokenExpiryDays" INTEGER;
