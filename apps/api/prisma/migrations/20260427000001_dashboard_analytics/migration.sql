ALTER TABLE "SearchSession"
  ADD COLUMN IF NOT EXISTS "channel" TEXT;

CREATE INDEX IF NOT EXISTS "SearchSession_channel_idx" ON "SearchSession"("channel");

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "searchId" TEXT;
