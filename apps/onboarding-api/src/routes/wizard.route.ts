import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getSession, advanceStep, saveCredentials } from '../services/session.service.js';
import { executeAutomatedStep } from '../services/step-executor.service.js';
import { getVendorFlow } from '@ibe/onboarding-flows';

function getSessionIdFromCookie(request: FastifyRequest): number | null {
  const raw = (request.cookies as Record<string, string | undefined>)['onb_session'];
  if (!raw) return null;
  const parsed = parseInt(raw);
  return isNaN(parsed) ? null : parsed;
}

export async function wizardRoutes(app: FastifyInstance) {
  app.get('/wizard/state', async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) return reply.unauthorized('No session');

    const session = await getSession(sessionId);
    if (!session) return reply.notFound('Session not found');

    const flow = getVendorFlow(session.invitation.pmsId ?? 0);
    const harvestedData = session.harvestedData as Record<string, unknown> | null;

    return {
      sessionId: session.id,
      pmsId: session.invitation.pmsId,
      pmsName: session.invitation.pmsName,
      dataFlow: flow?.dataFlow ?? null,
      currentStep: session.currentStep,
      totalSteps: flow?.steps.length ?? 0,
      steps: session.stepsJson,
      enrichedData: session.enrichedData,
      harvestedRooms: (harvestedData?.['rooms'] as Array<{ name: string; description: string }> | null) ?? null,
      harvestedRatePlanTypes: (harvestedData?.['discoveredRatePlanTypes'] as unknown[] | null) ?? null,
      harvestedTaxes: (harvestedData?.['taxesAndFees'] as unknown[] | null) ?? null,
      hgPropertyCode: session.hgPropertyCode,
      status: session.status,
    };
  });

  app.post<{ Body: { credentials: Record<string, string> } }>(
    '/wizard/submit-credentials',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');

      const session = await getSession(sessionId);
      if (!session) return reply.notFound('Session not found');

      const flow = getVendorFlow(session.invitation.pmsId ?? 0);
      if (!flow) return reply.badRequest('Unknown vendor');

      const parsed = flow.credentialsSchema.safeParse(request.body.credentials);
      if (!parsed.success) return reply.badRequest(parsed.error.issues[0]?.message ?? 'Invalid credentials');

      await saveCredentials(sessionId, parsed.data as Record<string, string>);
      await advanceStep(sessionId, session.currentStep, {
        stepId: flow.steps[session.currentStep]?.id ?? '',
        success: true,
        data: { credentials: parsed.data },
      });

      return { ok: true };
    }
  );

  app.post<{ Body: { enrichedData: Record<string, unknown> } }>(
    '/wizard/confirm-review',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');

      const session = await getSession(sessionId);
      if (!session) return reply.notFound('Session not found');

      const flow = getVendorFlow(session.invitation.pmsId ?? 0);
      if (!flow) return reply.badRequest('Unknown vendor');

      await advanceStep(sessionId, session.currentStep, {
        stepId: flow.steps[session.currentStep]?.id ?? '',
        success: true,
        data: request.body.enrichedData,
      });

      return { ok: true };
    }
  );

  app.get('/wizard/execute', async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) {
      reply.code(401).send('No session');
      return;
    }

    const session = await getSession(sessionId);
    if (!session) {
      reply.code(404).send('Session not found');
      return;
    }

    await executeAutomatedStep(sessionId, session.currentStep, reply);
  });
}
