-- Add isActive to CompSetSearchParam
ALTER TABLE "CompSetSearchParam" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: CompSetSearchParamOverride
CREATE TABLE IF NOT EXISTS "CompSetSearchParamOverride" (
    "id" SERIAL NOT NULL,
    "searchParamId" INTEGER NOT NULL,
    "orgId" INTEGER,
    "propertyId" INTEGER,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompSetSearchParamOverride_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompSetSearchParamOverride" ADD CONSTRAINT "CompSetSearchParamOverride_searchParamId_fkey"
    FOREIGN KEY ("searchParamId") REFERENCES "CompSetSearchParam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
