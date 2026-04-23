CREATE TABLE "OrgAIChannels" (
  "id" SERIAL NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "aiSearchBarModels" TEXT NOT NULL DEFAULT '["b2c","b2b"]',
  "whatsappModels" TEXT NOT NULL DEFAULT '[]',
  "mcpModels" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrgAIChannels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgAIChannels_organizationId_key" ON "OrgAIChannels"("organizationId");
ALTER TABLE "OrgAIChannels" ADD CONSTRAINT "OrgAIChannels_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
