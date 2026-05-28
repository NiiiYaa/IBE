import type { FastifyReply } from 'fastify';
import { getVendorFlow, type OnboardingContext } from '@ibe/onboarding-flows';
import { getHGBoClient } from './hg-bo.client.js';
import { advanceStep, getSession, completeSession } from './session.service.js';
import { buildEnrichedData } from './enrichment.service.js';
import { prisma } from '../db/client.js';

function sseEvent(reply: FastifyReply, data: Record<string, unknown>) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function executeAutomatedStep(sessionId: number, stepIndex: number, reply: FastifyReply) {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const session = await getSession(sessionId);
  if (!session) {
    sseEvent(reply, { type: 'error', message: 'Session not found' });
    reply.raw.end();
    return;
  }

  const invitation = session.invitation;
  const flow = getVendorFlow(invitation.pmsId ?? 0);
  if (!flow) {
    sseEvent(reply, { type: 'error', message: 'Unknown vendor' });
    reply.raw.end();
    return;
  }

  const enrichedData = (session.enrichedData as Record<string, unknown>) ?? {};
  const credentials = (enrichedData['credentials'] as Record<string, string>) ?? {};

  const ctx: OnboardingContext = {
    sessionId,
    pmsId: invitation.pmsId ?? 0,
    organizationId: invitation.organizationId ?? 0,
    credentials,
    enrichedData,
    ...(session.hgPropertyCode ? { hgPropertyCode: session.hgPropertyCode } : {}),
    completedSteps: [],
  };

  const step = flow.steps[stepIndex];
  if (!step) {
    sseEvent(reply, { type: 'error', message: `Step ${stepIndex} not found` });
    reply.raw.end();
    return;
  }
  sseEvent(reply, { type: 'start', stepId: step.id });

  const hgBoClient = getHGBoClient();

  try {
    if (step.id === 'enrich_data') {
      sseEvent(reply, { type: 'progress', message: 'Building enriched data...' });
      const enriched = buildEnrichedData({
        hotelName: invitation.hotelName,
        websiteUrl: invitation.ibeUrl,
        contactEmail: invitation.contactEmail,
        credentials,
      });
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true, data: enriched as unknown as Record<string, unknown> });
      sseEvent(reply, { type: 'complete', stepId: step.id, data: enriched as unknown as Record<string, unknown> });

    } else if (step.id === 'create_hg_property') {
      sseEvent(reply, { type: 'progress', message: 'Creating property in HyperGuest...' });
      const payload = flow.getHGPropertyPayload({ ...ctx, enrichedData: { ...enrichedData } });
      const result = await hgBoClient.createProperty(payload);
      const propertyCode = result.property.propertyCode;
      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { hgPropertyCode: propertyCode },
      });
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true, data: { propertyCode } });
      sseEvent(reply, { type: 'complete', stepId: step.id, data: { propertyCode } });

    } else if (step.id === 'trigger_ari_sync') {
      sseEvent(reply, { type: 'progress', message: 'Triggering ARI sync...' });
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code — create_hg_property must run first');
      await hgBoClient.triggerAriSync(propertyCode);
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
      const updatedSession = await getSession(sessionId);
      if (updatedSession && updatedSession.currentStep >= flow.steps.length - 1) {
        await completeSession(sessionId);
      }
      sseEvent(reply, { type: 'complete', stepId: step.id });

    } else {
      sseEvent(reply, { type: 'error', message: `Step ${step.id} is not an automated step` });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await advanceStep(sessionId, stepIndex, { stepId: step.id, success: false, error: message });
    sseEvent(reply, { type: 'error', message });
  }

  reply.raw.end();
}
