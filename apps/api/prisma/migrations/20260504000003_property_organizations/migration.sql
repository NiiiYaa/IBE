CREATE TABLE "PropertyOrganization" (
  "id"             SERIAL PRIMARY KEY,
  "propertyId"     INTEGER NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "isPrimary"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "PropertyOrganization"
  ADD CONSTRAINT "PropertyOrganization_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyOrganization"
  ADD CONSTRAINT "PropertyOrganization_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PropertyOrganization_propertyId_organizationId_key"
  ON "PropertyOrganization"("propertyId", "organizationId");

CREATE INDEX "PropertyOrganization_organizationId_idx"
  ON "PropertyOrganization"("organizationId");

-- Back-fill: every existing active property's current org becomes its primary owner
INSERT INTO "PropertyOrganization" ("propertyId", "organizationId", "isPrimary", "createdAt")
SELECT id, "organizationId", true, CURRENT_TIMESTAMP
FROM "Property"
WHERE "deletedAt" IS NULL;
