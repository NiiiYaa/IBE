CREATE TABLE "OrgMapsConfig" (
  "id" SERIAL NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'osm',
  "apiKey" TEXT,
  "poiRadius" INTEGER NOT NULL DEFAULT 1000,
  "poiCategories" TEXT NOT NULL DEFAULT '["restaurants","attractions","transport","shopping"]',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgMapsConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgMapsConfig_organizationId_key" ON "OrgMapsConfig"("organizationId");
ALTER TABLE "OrgMapsConfig" ADD CONSTRAINT "OrgMapsConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
