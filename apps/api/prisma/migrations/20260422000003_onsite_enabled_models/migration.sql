-- OnsiteConversionSettings: replace boolean enabled with per-model arrays
ALTER TABLE "OnsiteConversionSettings"
  ADD COLUMN "presenceEnabledModels" TEXT NOT NULL DEFAULT '["b2c","b2b"]',
  ADD COLUMN "bookingsEnabledModels" TEXT NOT NULL DEFAULT '["b2c","b2b"]',
  ADD COLUMN "popupEnabledModels"    TEXT NOT NULL DEFAULT '[]';

UPDATE "OnsiteConversionSettings" SET
  "presenceEnabledModels" = CASE WHEN "presenceEnabled" THEN '["b2c","b2b"]' ELSE '[]' END,
  "bookingsEnabledModels" = CASE WHEN "bookingsEnabled" THEN '["b2c","b2b"]' ELSE '[]' END,
  "popupEnabledModels"    = CASE WHEN "popupEnabled"    THEN '["b2c","b2b"]' ELSE '[]' END;

ALTER TABLE "OnsiteConversionSettings"
  DROP COLUMN "presenceEnabled",
  DROP COLUMN "bookingsEnabled",
  DROP COLUMN "popupEnabled";

-- PropertyOnsiteConversionSettings: same change, nullable (null = inherit)
ALTER TABLE "PropertyOnsiteConversionSettings"
  ADD COLUMN "presenceEnabledModels" TEXT,
  ADD COLUMN "bookingsEnabledModels" TEXT,
  ADD COLUMN "popupEnabledModels"    TEXT;

UPDATE "PropertyOnsiteConversionSettings" SET
  "presenceEnabledModels" = CASE
    WHEN "presenceEnabled" IS NULL THEN NULL
    WHEN "presenceEnabled" THEN '["b2c","b2b"]' ELSE '[]' END,
  "bookingsEnabledModels" = CASE
    WHEN "bookingsEnabled" IS NULL THEN NULL
    WHEN "bookingsEnabled" THEN '["b2c","b2b"]' ELSE '[]' END,
  "popupEnabledModels" = CASE
    WHEN "popupEnabled" IS NULL THEN NULL
    WHEN "popupEnabled" THEN '["b2c","b2b"]' ELSE '[]' END;

ALTER TABLE "PropertyOnsiteConversionSettings"
  DROP COLUMN "presenceEnabled",
  DROP COLUMN "bookingsEnabled",
  DROP COLUMN "popupEnabled";
