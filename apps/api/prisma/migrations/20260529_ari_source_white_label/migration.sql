-- CreateTable
CREATE TABLE "AriSourceWhiteLabel" (
    "pmsId" INTEGER NOT NULL,
    "whiteLabelOfPmsId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AriSourceWhiteLabel_pkey" PRIMARY KEY ("pmsId")
);
