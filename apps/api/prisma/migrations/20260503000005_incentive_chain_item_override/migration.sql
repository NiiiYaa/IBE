CREATE TABLE "IncentiveChainItemOverride" (
  "id"             SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "itemId"         INTEGER NOT NULL REFERENCES "IncentiveItem"("id") ON DELETE CASCADE,
  "disabled"       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE ("organizationId", "itemId")
);
CREATE INDEX "IncentiveChainItemOverride_organizationId_idx" ON "IncentiveChainItemOverride"("organizationId");
