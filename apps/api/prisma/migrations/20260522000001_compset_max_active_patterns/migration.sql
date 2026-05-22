-- Add maxActivePatterns to system config
ALTER TABLE "SystemCompSetConfig" ADD COLUMN IF NOT EXISTS "maxActivePatterns" INTEGER NOT NULL DEFAULT 4;

-- Chain/hotel-level overrides for CompSet config
CREATE TABLE IF NOT EXISTS "CompSetConfig" (
  "id"                SERIAL PRIMARY KEY,
  "orgId"             INTEGER,
  "propertyId"        INTEGER,
  "maxActivePatterns" INTEGER,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
