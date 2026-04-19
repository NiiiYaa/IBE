ALTER TABLE "Property" ADD COLUMN "subdomain" TEXT;
CREATE UNIQUE INDEX "Property_subdomain_key" ON "Property"("subdomain");
