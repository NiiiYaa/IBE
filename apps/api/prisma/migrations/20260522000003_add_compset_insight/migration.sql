-- CreateTable
CREATE TABLE "CompSetInsight" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "CompSetInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompSetInsight_propertyId_key" ON "CompSetInsight"("propertyId");

-- AddForeignKey
ALTER TABLE "CompSetInsight" ADD CONSTRAINT "CompSetInsight_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
