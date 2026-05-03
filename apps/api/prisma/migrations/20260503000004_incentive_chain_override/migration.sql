CREATE TABLE "IncentiveChainPackageOverride" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "packageId"      INTEGER NOT NULL REFERENCES "IncentivePackage"("id") ON DELETE CASCADE,
  "disabled"       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE ("organizationId", "packageId")
);
CREATE INDEX "IncentiveChainPackageOverride_organizationId_idx" ON "IncentiveChainPackageOverride"("organizationId");
