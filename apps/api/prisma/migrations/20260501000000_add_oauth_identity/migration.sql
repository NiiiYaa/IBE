-- CreateTable
CREATE TABLE "OAuthIdentity" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'auth0',
    "sub" TEXT NOT NULL,
    "organizationId" INTEGER,
    "propertyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthIdentity_sub_key" ON "OAuthIdentity"("sub");

-- CreateIndex
CREATE INDEX "OAuthIdentity_organizationId_idx" ON "OAuthIdentity"("organizationId");

-- CreateIndex
CREATE INDEX "OAuthIdentity_propertyId_idx" ON "OAuthIdentity"("propertyId");
