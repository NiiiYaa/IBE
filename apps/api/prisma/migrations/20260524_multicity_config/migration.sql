CREATE TABLE "SystemMultiCityConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxLegs" INTEGER NOT NULL DEFAULT 3,
    "discountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incentiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "incentivePackageId" INTEGER,
    CONSTRAINT "SystemMultiCityConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgMultiCityConfig" (
    "organizationId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "maxLegs" INTEGER,
    "discountEnabled" BOOLEAN,
    "discountPercent" DOUBLE PRECISION,
    "incentiveEnabled" BOOLEAN,
    "incentivePackageId" INTEGER,
    CONSTRAINT "OrgMultiCityConfig_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "OrgMultiCityConfig" ADD CONSTRAINT "OrgMultiCityConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
