CREATE TABLE "SystemWLConfig" (
  "id"                      SERIAL PRIMARY KEY,
  "channelUuid"             TEXT,
  "enabled"                 BOOLEAN NOT NULL DEFAULT false,
  "enforceChildCreds"       BOOLEAN NOT NULL DEFAULT false,
  "airportDataset"          JSONB,
  "airportDatasetUpdatedAt" TIMESTAMP(3),
  "airportRadiusKm"         INTEGER NOT NULL DEFAULT 100,
  "airportMaxCount"         INTEGER NOT NULL DEFAULT 3,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OrgWLConfig" (
  "id"                    SERIAL PRIMARY KEY,
  "organizationId"        INTEGER NOT NULL UNIQUE,
  "channelUuid"           TEXT,
  "enabled"               BOOLEAN NOT NULL DEFAULT false,
  "enforceChildCreds"     BOOLEAN NOT NULL DEFAULT false,
  "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PropertyWLConfig" (
  "id"          SERIAL PRIMARY KEY,
  "propertyId"  INTEGER NOT NULL UNIQUE,
  "channelUuid" TEXT,
  "enabled"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE
);
