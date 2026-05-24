CREATE TABLE "SystemMultiCityConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxLegs" INTEGER NOT NULL DEFAULT 3,
    CONSTRAINT "SystemMultiCityConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgMultiCityConfig" (
    "organizationId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "maxLegs" INTEGER,
    CONSTRAINT "OrgMultiCityConfig_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "OrgMultiCityConfig" ADD CONSTRAINT "OrgMultiCityConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
