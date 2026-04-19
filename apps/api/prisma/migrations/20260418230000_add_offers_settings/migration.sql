-- CreateTable
CREATE TABLE "OrgOffersSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL UNIQUE,
    "minNights" INTEGER,
    "maxNights" INTEGER,
    "minRooms" INTEGER,
    "maxRooms" INTEGER,
    "allowedCancellationPolicies" TEXT,
    "allowedBoardTypes" TEXT,
    "allowedChargeParties" TEXT,
    "allowedPaymentMethods" TEXT,
    "minOfferValue" DECIMAL,
    "minOfferCurrency" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PropertyOffersSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "propertyId" INTEGER NOT NULL UNIQUE,
    "minNights" INTEGER,
    "maxNights" INTEGER,
    "minRooms" INTEGER,
    "maxRooms" INTEGER,
    "allowedCancellationPolicies" TEXT,
    "allowedBoardTypes" TEXT,
    "allowedChargeParties" TEXT,
    "allowedPaymentMethods" TEXT,
    "minOfferValue" DECIMAL,
    "minOfferCurrency" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
