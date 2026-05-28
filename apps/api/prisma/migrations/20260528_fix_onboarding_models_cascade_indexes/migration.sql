-- DropForeignKey
ALTER TABLE "OnboardingHelpRequest" DROP CONSTRAINT "OnboardingHelpRequest_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingSession" DROP CONSTRAINT "OnboardingSession_invitationId_fkey";

-- AlterTable
ALTER TABLE "OnboardingHelpRequest" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "OnboardingInvitation_organizationId_idx" ON "OnboardingInvitation"("organizationId");

-- CreateIndex
CREATE INDEX "OnboardingInvitation_harvestStatus_idx" ON "OnboardingInvitation"("harvestStatus");

-- CreateIndex
CREATE INDEX "OnboardingInvitation_expiresAt_idx" ON "OnboardingInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "OnboardingSession_status_idx" ON "OnboardingSession"("status");

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "OnboardingInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingHelpRequest" ADD CONSTRAINT "OnboardingHelpRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
