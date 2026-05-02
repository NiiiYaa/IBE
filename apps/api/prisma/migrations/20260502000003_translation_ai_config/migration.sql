CREATE TABLE IF NOT EXISTS "TranslationAIConfig" (
  "id"               SERIAL PRIMARY KEY,
  "useSystemDefault" BOOLEAN NOT NULL DEFAULT true,
  "provider"         TEXT,
  "model"            TEXT,
  "apiKey"           TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
