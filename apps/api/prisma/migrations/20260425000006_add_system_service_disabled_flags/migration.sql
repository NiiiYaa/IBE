-- Add systemServiceDisabled to OrgAIConfig
ALTER TABLE "OrgAIConfig" ADD COLUMN "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false;

-- Add systemServiceDisabled to PropertyAIConfig
ALTER TABLE "PropertyAIConfig" ADD COLUMN "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false;

-- Add systemServiceDisabled to OrgMapsConfig
ALTER TABLE "OrgMapsConfig" ADD COLUMN "systemServiceDisabled" BOOLEAN NOT NULL DEFAULT false;

-- Add email and whatsapp system service disable flags to CommunicationSettings
ALTER TABLE "CommunicationSettings" ADD COLUMN "emailSystemServiceDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommunicationSettings" ADD COLUMN "whatsappSystemServiceDisabled" BOOLEAN NOT NULL DEFAULT false;
