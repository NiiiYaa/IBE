-- AlterTable
ALTER TABLE "TrackingPixel" ADD COLUMN "propertyId" INTEGER;

-- CreateIndex
CREATE INDEX "TrackingPixel_propertyId_idx" ON "TrackingPixel"("propertyId");
