ALTER TABLE "GroupConfig" ADD COLUMN IF NOT EXISTS "groupPolicies" TEXT;
ALTER TABLE "PropertyGroupConfig" ADD COLUMN IF NOT EXISTS "groupPolicies" TEXT;
