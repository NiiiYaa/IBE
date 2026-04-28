-- Add whatsappWebjsServiceUrl to SystemCommunicationSettings
ALTER TABLE "SystemCommunicationSettings" ADD COLUMN IF NOT EXISTS "whatsappWebjsServiceUrl" TEXT NOT NULL DEFAULT '';

-- Add whatsappWebjsServiceUrl to CommunicationSettings (org-level)
ALTER TABLE "CommunicationSettings" ADD COLUMN IF NOT EXISTS "whatsappWebjsServiceUrl" TEXT NOT NULL DEFAULT '';

-- Create PropertyCommunicationSettings table if it doesn't exist
CREATE TABLE IF NOT EXISTS "PropertyCommunicationSettings" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "whatsappWebjsServiceUrl" TEXT NOT NULL DEFAULT '',
    "whatsappSystemServiceDisabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyCommunicationSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PropertyCommunicationSettings_propertyId_key" ON "PropertyCommunicationSettings"("propertyId");
