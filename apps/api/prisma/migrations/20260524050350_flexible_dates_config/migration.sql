-- CreateTable
CREATE TABLE "SystemFlexibleDatesConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "daysBefore" INTEGER NOT NULL DEFAULT 1,
    "daysAfter" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SystemFlexibleDatesConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgFlexibleDatesConfig" (
    "orgId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "daysBefore" INTEGER,
    "daysAfter" INTEGER,

    CONSTRAINT "OrgFlexibleDatesConfig_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "PropertyFlexibleDatesConfig" (
    "propertyId" INTEGER NOT NULL,
    "enabled" BOOLEAN,
    "daysBefore" INTEGER,
    "daysAfter" INTEGER,

    CONSTRAINT "PropertyFlexibleDatesConfig_pkey" PRIMARY KEY ("propertyId")
);

-- AddForeignKey
ALTER TABLE "OrgFlexibleDatesConfig" ADD CONSTRAINT "OrgFlexibleDatesConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyFlexibleDatesConfig" ADD CONSTRAINT "PropertyFlexibleDatesConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;
