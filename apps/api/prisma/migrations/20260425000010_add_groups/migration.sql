CREATE TABLE "GroupConfig" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "bookingMode" TEXT NOT NULL DEFAULT 'offline',
  "groupEmail" TEXT,
  "pricingDirection" TEXT NOT NULL DEFAULT 'decrease',
  "pricingPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "cancellationRanges" JSONB NOT NULL DEFAULT '[]',
  "paymentInParWithCancellation" BOOLEAN NOT NULL DEFAULT true,
  "paymentRanges" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE "PropertyGroupConfig" (
  "id" SERIAL PRIMARY KEY,
  "propertyId" INTEGER NOT NULL UNIQUE,
  "organizationId" INTEGER NOT NULL,
  "enabled" BOOLEAN,
  "bookingMode" TEXT,
  "groupEmail" TEXT,
  "pricingDirection" TEXT,
  "pricingPct" DECIMAL(5,2),
  "cancellationRanges" JSONB,
  "paymentInParWithCancellation" BOOLEAN,
  "paymentRanges" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyGroupConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "PropertyGroupConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX "PropertyGroupConfig_organizationId_idx" ON "PropertyGroupConfig"("organizationId");
