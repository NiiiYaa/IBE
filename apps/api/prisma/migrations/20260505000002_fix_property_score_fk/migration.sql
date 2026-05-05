-- Fix PropertyScore FK: was referencing Property.id (auto-increment PK)
-- but propertyScore.propertyId stores the HyperGuest propertyId, not the internal id.
ALTER TABLE "PropertyScore" DROP CONSTRAINT "PropertyScore_propertyId_fkey";
ALTER TABLE "PropertyScore" ADD CONSTRAINT "PropertyScore_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
