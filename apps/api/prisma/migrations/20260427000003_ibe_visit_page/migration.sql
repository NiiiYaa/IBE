ALTER TABLE "IBEVisit" ADD COLUMN IF NOT EXISTS "page" TEXT NOT NULL DEFAULT 'home';
DROP INDEX IF EXISTS "IBEVisit_sessionId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "IBEVisit_sessionId_page_key" ON "IBEVisit"("sessionId", "page");
CREATE INDEX IF NOT EXISTS "IBEVisit_page_idx" ON "IBEVisit"("page");
