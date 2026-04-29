-- Add email + own-config + WhatsApp Meta/Twilio columns to PropertyCommunicationSettings

ALTER TABLE "PropertyCommunicationSettings"
  ADD COLUMN IF NOT EXISTS "emailEnabled"                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emailProvider"                TEXT    NOT NULL DEFAULT 'smtp',
  ADD COLUMN IF NOT EXISTS "emailFromName"                TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "emailFromAddress"             TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "emailSmtpHost"                TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "emailSmtpPort"                INTEGER NOT NULL DEFAULT 587,
  ADD COLUMN IF NOT EXISTS "emailSmtpUser"                TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "emailSmtpPassword"            TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "emailSmtpSecure"              BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "emailApiKey"                  TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "emailSystemServiceDisabled"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "useOwnEmail"                  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "useOwnWhatsapp"               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whatsappEnabled"              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whatsappProvider"             TEXT    NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS "whatsappPhoneNumberId"        TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappBusinessAccountId"    TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappAccessToken"          TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappTwilioAccountSid"     TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappTwilioAuthToken"      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "whatsappTwilioNumber"         TEXT    NOT NULL DEFAULT '';
