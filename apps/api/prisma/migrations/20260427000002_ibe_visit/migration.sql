CREATE TABLE IF NOT EXISTS "IBEVisit" (
  "id"         SERIAL PRIMARY KEY,
  "sessionId"  TEXT NOT NULL,
  "propertyId" INTEGER,
  "channel"    TEXT NOT NULL DEFAULT 'b2c',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IBEVisit_sessionId_key" ON "IBEVisit"("sessionId");
CREATE INDEX IF NOT EXISTS "IBEVisit_createdAt_idx" ON "IBEVisit"("createdAt");
CREATE INDEX IF NOT EXISTS "IBEVisit_propertyId_idx" ON "IBEVisit"("propertyId");
