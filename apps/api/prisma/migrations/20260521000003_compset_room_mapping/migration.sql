-- Add comparisonMode to CompSetCompetitor
ALTER TABLE "CompSetCompetitor" ADD COLUMN IF NOT EXISTS "comparisonMode" TEXT NOT NULL DEFAULT 'cheapest';

-- CreateTable: CompSetRoomMapping
CREATE TABLE IF NOT EXISTS "CompSetRoomMapping" (
    "id" SERIAL NOT NULL,
    "competitorId" INTEGER NOT NULL,
    "compRoomName" TEXT NOT NULL,
    "ownRoomName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompSetRoomMapping_pkey" PRIMARY KEY ("id")
);

-- AddUniqueConstraint
CREATE UNIQUE INDEX IF NOT EXISTS "CompSetRoomMapping_competitorId_compRoomName_key"
    ON "CompSetRoomMapping"("competitorId", "compRoomName");

-- AddForeignKey
ALTER TABLE "CompSetRoomMapping" ADD CONSTRAINT "CompSetRoomMapping_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "CompSetCompetitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
