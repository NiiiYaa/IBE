ALTER TABLE "PropertyDataProviderConfig" DROP CONSTRAINT "PropertyDataProviderConfig_propertyId_fkey";
ALTER TABLE "PropertyDataProviderConfig" ADD CONSTRAINT "PropertyDataProviderConfig_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
