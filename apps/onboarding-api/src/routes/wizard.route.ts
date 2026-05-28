import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getSession, advanceStep, saveCredentials } from '../services/session.service.js';
import { executeAutomatedStep } from '../services/step-executor.service.js';
import { getVendorFlow } from '@ibe/onboarding-flows';
import { prisma } from '../db/client.js';

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
      useDefaultCodes: flow?.useDefaultCodes ?? false,
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

  app.get('/wizard/extend-harvest', async (request, reply) => {
    const sessionId = getSessionIdFromCookie(request);
    if (!sessionId) return reply.unauthorized('No session');
    const session = await getSession(sessionId);
    if (!session) return reply.notFound();
    if (!session.invitation.ibeUrl) return reply.badRequest('No IBE URL');

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    const sseEvent = (data: Record<string, unknown>) =>
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      sseEvent({ type: 'progress', message: 'Running extended search (90 days, 3 nights, up to 5 adults)...' });
      const existing = (session.harvestedData as Record<string, unknown>) ?? {};
      const { harvestFromUrl } = await import('../services/ibe-harvester.service.js');
      const newData = await harvestFromUrl(
        session.invitation.ibeUrl,
        (msg: string) => sseEvent({ type: 'progress', message: msg }),
      );
      // Merge rooms: deduplicate by name
      const existingRooms = (existing['rooms'] as Array<{ name: string }>) ?? [];
      const newRooms = newData.rooms.filter(r => !existingRooms.some((e: { name: string }) => e.name === r.name));
      const merged = { ...existing, ...newData, rooms: [...existingRooms, ...newRooms] };
      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { harvestedData: merged as any },
      });
      sseEvent({ type: 'complete', newRoomCount: newRooms.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Extended harvest failed';
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
    }
    reply.raw.end();
  });

  app.post<{ Body: { name: string; maxAdults: number; maxOccupancy: number; bedConfiguration: string } }>(
    '/wizard/add-room-manually',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');
      const session = await getSession(sessionId);
      if (!session) return reply.notFound();

      const { name, maxAdults, maxOccupancy, bedConfiguration } = request.body;
      if (!name?.trim()) return reply.badRequest('name required');

      const existing = (session.harvestedData as Record<string, unknown>) ?? {};
      const rooms = ((existing['rooms'] as unknown[]) ?? []) as Array<Record<string, unknown>>;
      const newRoom = {
        name: name.trim(), description: '', images: [],
        bedConfiguration: bedConfiguration ?? null,
        amenities: [], supportedOccupancies: [{ adults: maxAdults, children: 0 }],
        maxAdults, maxOccupancy,
      };
      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { harvestedData: { ...existing, rooms: [...rooms, newRoom] } as any },
      });
      return reply.send({ ok: true });
    }
  );

  app.post<{ Body: { cmSettings: {
    currency: string;
    pricingModel: 'per_room' | 'per_occupancy' | 'per_person';
    ratePlans: Array<{
      boardCode: string; boardCodeRawName: string; isRefundable: boolean;
      pmsRateplanCode: string; priceType: 'gross' | 'net';
      commissionPercent: number; charge: 'agent' | 'customer';
      cancellationPolicy: unknown | null;
    }>;
    taxRelations: Record<string, string>;
  } } }>(
    '/wizard/submit-cm-settings',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');
      const session = await getSession(sessionId);
      if (!session) return reply.notFound();
      const flow = getVendorFlow(session.invitation.pmsId ?? 0);
      if (!flow) return reply.badRequest('Unknown vendor');

      const { cmSettings } = request.body;
      if (!cmSettings.currency?.trim()) return reply.badRequest('currency required');
      if (cmSettings.ratePlans.length === 0) return reply.badRequest('at least one rate plan required');

      const needsCodes = !flow.ratePlanCodesProvidedByStaff && !flow.useDefaultCodes;
      if (needsCodes) {
        const missing = cmSettings.ratePlans.find(rp => !rp.pmsRateplanCode?.trim());
        if (missing) return reply.badRequest(`CM code required for rate plan: ${missing.boardCodeRawName}`);
      }

      const existing = (session.enrichedData as Record<string, unknown>) ?? {};
      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { enrichedData: { ...existing, cmSettings } as any },
      });
      await advanceStep(sessionId, session.currentStep, {
        stepId: flow.steps[session.currentStep]?.id ?? '',
        success: true,
      });
      return reply.send({ ok: true });
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
