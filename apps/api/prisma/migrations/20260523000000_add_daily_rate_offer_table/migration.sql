CREATE TABLE "DailyRateOffer" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "roomId" INTEGER NOT NULL,
    "roomName" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "cancellationLabel" TEXT NOT NULL,
    "sellPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRateOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyRateOffer_propertyId_date_rank_key" ON "DailyRateOffer"("propertyId", "date", "rank");

ALTER TABLE "DailyRateOffer" ADD CONSTRAINT "DailyRateOffer_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
