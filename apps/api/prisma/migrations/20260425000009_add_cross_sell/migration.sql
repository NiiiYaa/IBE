CREATE TABLE "CrossSellConfig" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "paymentMode" TEXT NOT NULL DEFAULT 'informational',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrossSellConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE "CrossSellProduct" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "imageUrl" TEXT,
  "price" DECIMAL(10,2) NOT NULL,
  "tax" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "pricingModel" TEXT NOT NULL DEFAULT 'per_item',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'active',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrossSellProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX "CrossSellProduct_organizationId_status_idx" ON "CrossSellProduct"("organizationId", "status");

CREATE TABLE "PropertyCrossSellConfig" (
  "id" SERIAL PRIMARY KEY,
  "propertyId" INTEGER NOT NULL UNIQUE,
  "organizationId" INTEGER NOT NULL,
  "enabled" BOOLEAN,
  "paymentMode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyCrossSellConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "PropertyCrossSellConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX "PropertyCrossSellConfig_organizationId_idx" ON "PropertyCrossSellConfig"("organizationId");

ALTER TABLE "CrossSellConfig" ADD COLUMN "showExternalEvents" BOOLEAN NOT NULL DEFAULT false;
