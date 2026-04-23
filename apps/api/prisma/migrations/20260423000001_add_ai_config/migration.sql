-- AI Configuration: three-tier inheritance (System → Org → Property)

CREATE TABLE "SystemAIConfig" (
    "id"           SERIAL PRIMARY KEY,
    "provider"     TEXT NOT NULL,
    "model"        TEXT NOT NULL,
    "apiKey"       TEXT NOT NULL,
    "systemPrompt" TEXT,
    "enabled"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL
);

CREATE TABLE "OrgAIConfig" (
    "id"             SERIAL PRIMARY KEY,
    "organizationId" INTEGER NOT NULL,
    "useInherited"   BOOLEAN NOT NULL DEFAULT true,
    "provider"       TEXT,
    "model"          TEXT,
    "apiKey"         TEXT,
    "systemPrompt"   TEXT,
    "enabled"        BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgAIConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrgAIConfig_organizationId_key" ON "OrgAIConfig"("organizationId");

CREATE TABLE "PropertyAIConfig" (
    "id"           SERIAL PRIMARY KEY,
    "propertyId"   INTEGER NOT NULL,
    "useInherited" BOOLEAN NOT NULL DEFAULT true,
    "provider"     TEXT,
    "model"        TEXT,
    "apiKey"       TEXT,
    "systemPrompt" TEXT,
    "enabled"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "PropertyAIConfig_propertyId_key" ON "PropertyAIConfig"("propertyId");
