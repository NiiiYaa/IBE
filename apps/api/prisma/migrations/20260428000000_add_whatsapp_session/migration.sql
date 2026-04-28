CREATE TABLE IF NOT EXISTS "WhatsAppSession" (
    "id" SERIAL NOT NULL,
    "clientKey" TEXT NOT NULL,
    "authData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_clientKey_key" ON "WhatsAppSession"("clientKey");
