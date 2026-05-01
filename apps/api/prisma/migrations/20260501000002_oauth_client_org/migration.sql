ALTER TABLE "OAuthClient" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
