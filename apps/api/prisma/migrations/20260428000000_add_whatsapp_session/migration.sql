CREATE TABLE "WhatsAppSession" (
    "id" SERIAL NOT NULL,
    "clientKey" TEXT NOT NULL,
    "authData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppSession_clientKey_key" ON "WhatsAppSession"("clientKey");
