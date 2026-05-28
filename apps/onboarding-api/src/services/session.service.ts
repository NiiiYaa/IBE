import { prisma } from '../db/client.js';
import type { StepResult } from '@ibe/onboarding-flows';
import { getVendorFlow } from '@ibe/onboarding-flows';

export class OnboardingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export async function initSession(token: string) {
  const invitation = await prisma.onboardingInvitation.findUnique({
    where: { token },
    include: { session: true },
  });

  if (!invitation) throw new OnboardingError('invalid invitation token', 'invalid');
  if (invitation.revokedAt) throw new OnboardingError('Invitation revoked', 'revoked');
  if (invitation.usedAt) throw new OnboardingError('Invitation already used', 'already_used');
  if (invitation.expiresAt < new Date()) throw new OnboardingError('Invitation expired', 'expired');

  if (invitation.harvestStatus === 'failed') {
    throw new OnboardingError('Harvest failed for this invitation — please contact support', 'harvest_failed');
  }
  if (invitation.harvestStatus === 'harvesting') {
    throw new OnboardingError('Your data is still being prepared — please try again in a moment', 'harvest_pending');
  }

  const flow = getVendorFlow(invitation.pmsId ?? 0);
  if (!flow) throw new OnboardingError(`No flow for pmsId ${invitation.pmsId}`, 'unknown_pms');

  const hasPreHarvestedData = invitation.harvestStatus === 'complete' && invitation.harvestedData != null;
  const initialSteps = flow.steps.map((s) => {
    const isHarvestStep = s.kind === 'automated' && s.id === 'harvest_data';
    const isSearchStep = s.id === 'candidate_search';
    const isAriSelection = s.id === 'ari_source_selection';
    const pmsAlreadyKnown = invitation.pmsId != null;
    if (hasPreHarvestedData && (isHarvestStep || isSearchStep)) {
      return { ...s, status: 'completed' };
    }
    if (pmsAlreadyKnown && isAriSelection) {
      return { ...s, status: 'completed' };
    }
    return { ...s, status: 'pending' };
  });
  const firstPending = initialSteps.findIndex((s) => s.status === 'pending');
  const currentStep = firstPending === -1 ? initialSteps.length : firstPending;

  const [session] = await Promise.all([
    prisma.onboardingSession.create({
      data: {
        invitationId: invitation.id,
        stepsJson: initialSteps,
        currentStep,
        ...(hasPreHarvestedData && invitation.harvestedData != null ? { harvestedData: invitation.harvestedData } : {}),
      },
    }),
    prisma.onboardingInvitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return session;
}

export async function getSession(sessionId: number) {
  return prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    include: { invitation: true },
  });
}

export async function advanceStep(sessionId: number, currentStep: number, result: StepResult) {
  const session = await prisma.onboardingSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new OnboardingError('Session not found', 'not_found');

  const steps = session.stepsJson as Array<Record<string, unknown>>;
  steps[currentStep] = { ...steps[currentStep], status: result.success ? 'completed' : 'failed', result };

  return prisma.onboardingSession.update({
    where: { id: sessionId },
    data: {
      stepsJson: steps,
      currentStep: result.success ? currentStep + 1 : currentStep,
      ...(result.data ? { enrichedData: { ...(session.enrichedData as object ?? {}), ...result.data } } : {}),
    },
  });
}

export async function saveCredentials(sessionId: number, credentials: Record<string, string>) {
  const session = await prisma.onboardingSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new OnboardingError('Session not found', 'not_found');
  return prisma.onboardingSession.update({
    where: { id: sessionId },
    data: { enrichedData: { ...(session.enrichedData as object ?? {}), credentials } },
  });
}

export async function initSelfRegistration(input: {
  hotelName: string;
  pmsId: number;
  contactEmail: string;
  websiteUrl?: string;
}) {
  const flow = getVendorFlow(input.pmsId);
  if (!flow) throw new OnboardingError(`No flow for pmsId ${input.pmsId}`, 'unknown_pms');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const initialSteps = flow.steps.map((s) => ({ ...s, status: 'pending' }));

  const invitation = await prisma.onboardingInvitation.create({
    data: {
      source: 'self_registration',
      pmsId: input.pmsId,
      pmsName: flow.pmsName,
      hotelName: input.hotelName,
      contactEmail: input.contactEmail,
      ...(input.websiteUrl !== undefined ? { ibeUrl: input.websiteUrl } : {}),
      expiresAt,
      usedAt: new Date(),
    },
  });

  const session = await prisma.onboardingSession.create({
    data: {
      invitationId: invitation.id,
      stepsJson: initialSteps,
      currentStep: 0,
    },
  });

  return session;
}

export async function completeSession(sessionId: number) {
  return prisma.onboardingSession.update({
    where: { id: sessionId },
    data: { status: 'pending_review' },
  });
}
