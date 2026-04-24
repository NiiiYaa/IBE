-- CreateTable
CREATE TABLE "OrgMcpConfig" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMcpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyMcpConfig" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyMcpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgMcpConfig_organizationId_key" ON "OrgMcpConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMcpConfig_apiKey_key" ON "OrgMcpConfig"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyMcpConfig_propertyId_key" ON "PropertyMcpConfig"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyMcpConfig_apiKey_key" ON "PropertyMcpConfig"("apiKey");

-- AddForeignKey
ALTER TABLE "OrgMcpConfig" ADD CONSTRAINT "OrgMcpConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
