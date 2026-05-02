CREATE TABLE "Translation" (
  "id"        SERIAL PRIMARY KEY,
  "locale"    TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Translation_locale_namespace_key_key" UNIQUE ("locale", "namespace", "key")
);
CREATE INDEX "Translation_locale_namespace_idx" ON "Translation"("locale", "namespace");
CREATE INDEX "Translation_locale_idx" ON "Translation"("locale");
