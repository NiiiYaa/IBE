-- CreateTable
CREATE TABLE "PriceComparisonCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "otaId" INTEGER NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "price" DECIMAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceComparisonCache_cacheKey_key" ON "PriceComparisonCache"("cacheKey");

-- CreateIndex
CREATE INDEX "PriceComparisonCache_expiresAt_idx" ON "PriceComparisonCache"("expiresAt");
