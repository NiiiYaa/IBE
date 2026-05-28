-- CreateTable
CREATE TABLE "OnboardingInvitation" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "organizationId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'staff_invite',
    "zohoRecordId" TEXT,
    "pmsId" INTEGER,
    "pmsName" TEXT,
    "unknownPmsName" TEXT,
    "hotelName" TEXT,
    "city" TEXT,
    "country" TEXT,
    "ibeUrl" TEXT,
    "ibePattern" TEXT,
    "contactEmail" TEXT,
    "harvestStatus" TEXT NOT NULL DEFAULT 'pending',
    "harvestedData" JSONB,
    "failureReason" TEXT,
    "harvestNotifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminId" INTEGER,

    CONSTRAINT "OnboardingInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" SERIAL NOT NULL,
    "invitationId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "stepsJson" JSONB NOT NULL DEFAULT '[]',
    "harvestedData" JSONB,
    "enrichedData" JSONB,
    "hgPropertyCode" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByAdminId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingHelpRequest" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingHelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingInvitation_token_key" ON "OnboardingInvitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_invitationId_key" ON "OnboardingSession"("invitationId");

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "OnboardingInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingHelpRequest" ADD CONSTRAINT "OnboardingHelpRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
