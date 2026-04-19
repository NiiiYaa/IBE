-- AlterTable
ALTER TABLE "MessageRule" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "NavItem" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "PriceComparisonOta" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "deletedAt" DATETIME;
