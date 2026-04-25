CREATE TABLE "SystemWeatherConfig" (
  "id" SERIAL NOT NULL,
  "units" TEXT NOT NULL DEFAULT 'celsius',
  "forecastDays" INTEGER NOT NULL DEFAULT 7,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemWeatherConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgWeatherConfig" (
  "id" SERIAL NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "units" TEXT NOT NULL DEFAULT 'celsius',
  "forecastDays" INTEGER NOT NULL DEFAULT 7,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgWeatherConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgWeatherConfig_organizationId_key" ON "OrgWeatherConfig"("organizationId");
ALTER TABLE "OrgWeatherConfig" ADD CONSTRAINT "OrgWeatherConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE "SystemEventsConfig" (
  "id" SERIAL NOT NULL,
  "apiKey" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "radiusKm" INTEGER NOT NULL DEFAULT 10,
  "maxEvents" INTEGER NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemEventsConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgEventsConfig" (
  "id" SERIAL NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "apiKey" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "radiusKm" INTEGER NOT NULL DEFAULT 10,
  "maxEvents" INTEGER NOT NULL DEFAULT 10,
  "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgEventsConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgEventsConfig_organizationId_key" ON "OrgEventsConfig"("organizationId");
ALTER TABLE "OrgEventsConfig" ADD CONSTRAINT "OrgEventsConfig_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
