import type { FastifyReply } from 'fastify';
import { type OnboardingContext } from '@ibe/onboarding-flows';
import { resolveVendorFlow } from './flow-resolver.service.js';
import { getHGBoClient } from './hg-bo.client.js';
import { advanceStep, getSession, completeSession } from './session.service.js';
import { buildEnrichedData } from './enrichment.service.js';
import { harvestFromUrl } from './ibe-harvester.service.js';
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
  const flow = await resolveVendorFlow(invitation.pmsId ?? 0);
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
    if (step.id === 'geocode_address') {
      sseEvent(reply, { type: 'progress', message: 'Looking up property address and coordinates...' });
      const harvestedData = (session.harvestedData as Record<string, unknown>) ?? {};
      const existingAddress = harvestedData['address'] as string | null;
      const enriched = (session.enrichedData as Record<string, unknown>) ?? {};
      const hotelName = invitation.hotelName ?? '';
      const city = (enriched['city'] as string) ?? '';
      const countryCode = (enriched['countryCode'] as string) ?? '';

      // Build query: prefer harvested address (accurate), fall back to name+city+country
      const query = encodeURIComponent(existingAddress ?? [hotelName, city, countryCode].filter(Boolean).join(' '))
      let geoResult: { address: string; latitude: number; longitude: number } | null = null

      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${query}&format=jsonv2&limit=1&addressdetails=1`,
          { headers: { 'User-Agent': 'HyperGuestIBE/1.0 (nir@hyperguest.com)' }, signal: AbortSignal.timeout(8000) }
        )
        if (geoRes.ok) {
          const data = await geoRes.json() as Array<{ display_name: string; lat: string; lon: string }>
          if (data.length) {
            geoResult = {
              address: existingAddress ?? data[0]!.display_name,
              latitude: parseFloat(data[0]!.lat),
              longitude: parseFloat(data[0]!.lon),
            }
          }
        }
      } catch { /* non-fatal — proceed without coordinates */ }

      const geoData = geoResult ?? { address: existingAddress ?? '', latitude: null, longitude: null }
      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { enrichedData: { ...enriched, ...geoData } as any },
      })
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true, data: geoData as any })
      sseEvent(reply, { type: 'complete', stepId: step.id, data: geoData as any })

    } else if (step.id === 'enrich_data') {
      sseEvent(reply, { type: 'progress', message: 'Building enriched data...' });
      const enriched = buildEnrichedData({
        hotelName: invitation.hotelName,
        websiteUrl: invitation.ibeUrl,
        contactEmail: invitation.contactEmail,
        credentials,
      });
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true, data: enriched as unknown as Record<string, unknown> });
      sseEvent(reply, { type: 'complete', stepId: step.id, data: enriched as unknown as Record<string, unknown> });

    } else if (step.id === 'harvest_data') {
      if (!invitation.ibeUrl) throw new Error('No IBE URL on invitation — cannot harvest');

      const harvestedData = await harvestFromUrl(
        invitation.ibeUrl,
        (msg: string) => sseEvent(reply, { type: 'progress', message: msg }),
      );

      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { harvestedData: harvestedData as any },
      });
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
      sseEvent(reply, { type: 'complete', stepId: step.id });

    } else if (step.id === 'create_hg_property') {
      sseEvent(reply, { type: 'progress', message: 'Creating property in HyperGuest...' });
      const payload = flow.getHGPropertyPayload({ ...ctx, enrichedData: { ...enrichedData } });
      // Inject geocode data from enrichedData into the property location (available after geocode_address step)
      if (enrichedData['latitude'] && enrichedData['longitude']) {
        const prop = payload['property'] as Record<string, unknown>
        const loc = (prop['location'] as Record<string, unknown>) ?? {}
        prop['location'] = {
          ...loc,
          latitude: enrichedData['latitude'],
          longitude: enrichedData['longitude'],
          ...(enrichedData['address'] ? { address: enrichedData['address'] } : {}),
        }
      }
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

    } else if (step.id === 'create_rooms') {
      const harvestedData = (session.harvestedData as Record<string, unknown>) ?? {};
      const rooms = (harvestedData['rooms'] as Array<{ name: string; bedConfiguration?: string | null }>) ?? [];
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code — create_hg_property must run first');

      let roomCodes: Record<string, string>;
      if (flow.useDefaultCodes) {
        // Generate ROOM-01, ROOM-02, … and persist for downstream steps (create_rateplans, create_taxes)
        roomCodes = Object.fromEntries(
          rooms.map((r, i) => [r.name, `ROOM-${String(i + 1).padStart(2, '0')}`])
        );
        const existing = (session.enrichedData as Record<string, unknown>) ?? {};
        await prisma.onboardingSession.update({
          where: { id: sessionId },
          data: { enrichedData: { ...existing, roomCodes } as any },
        });
      } else {
        roomCodes = ((session.enrichedData as Record<string, unknown>)?.['roomCodes'] as Record<string, string>) ?? {};
      }

      for (const room of rooms) {
        const code = roomCodes[room.name];
        if (!code) throw new Error(`No CM code for room: ${room.name}`);
        sseEvent(reply, { type: 'progress', message: `Creating room: ${room.name}` });
        try {
          await hgBoClient.createRoom(propertyCode, { type: room.name, name: room.name, code });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('409') && !msg.includes('already')) throw err;
        }
      }
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
      sseEvent(reply, { type: 'complete', stepId: step.id });

    } else if (step.id === 'create_rateplans') {
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code');
      const enriched = (session.enrichedData as Record<string, unknown>) ?? {};
      const cmSettings = (enriched['cmSettings'] as {
        ratePlans: Array<{ pmsRateplanCode: string; boardCode: string; priceType: 'gross' | 'net'; isRefundable: boolean }>;
      }) ?? { ratePlans: [] };
      const roomCodes = (enriched['roomCodes'] as Record<string, string>) ?? {};
      const allRoomCodes = Object.values(roomCodes);

      let ratePlans = cmSettings.ratePlans;
      if (flow.useDefaultCodes) {
        // Generate FLEX-{BOARD} for refundable, NRF-{BOARD} for non-refundable
        // Persist updated codes so create_policies + create_taxes use the correct pmsRateplanCode
        ratePlans = ratePlans.map(rp => ({
          ...rp,
          pmsRateplanCode: rp.isRefundable ? `FLEX-${rp.boardCode}` : `NRF-${rp.boardCode}`,
        }));
        await prisma.onboardingSession.update({
          where: { id: sessionId },
          data: { enrichedData: { ...enriched, cmSettings: { ...cmSettings, ratePlans } } as any },
        });
      }

      for (const rp of ratePlans) {
        const code = flow.ratePlanCodeTransform
          ? flow.ratePlanCodeTransform(rp.pmsRateplanCode, rp.boardCode)
          : rp.pmsRateplanCode;
        if (!code) continue;
        sseEvent(reply, { type: 'progress', message: `Creating rate plan: ${code}` });
        try {
          await hgBoClient.createRatePlan(propertyCode, {
            name: code,
            pmsRateplanCode: code,
            priceType: rp.priceType,
            boardCode: rp.boardCode as 'RO' | 'BB' | 'HB' | 'FB' | 'AI',
          });
          if (allRoomCodes.length > 0) {
            await hgBoClient.linkRoomsToRatePlan(propertyCode, code, allRoomCodes);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('409') && !msg.includes('already')) throw err;
        }
      }
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
      sseEvent(reply, { type: 'complete', stepId: step.id });

    } else if (step.id === 'create_policies') {
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code');
      const cmSettings = ((session.enrichedData as Record<string, unknown>)?.['cmSettings'] as {
        ratePlans: Array<{ pmsRateplanCode: string; cancellationPolicy: unknown | null }>;
      }) ?? { ratePlans: [] };

      // Deduplicate policies by JSON fingerprint
      const policyMap = new Map<string, { payload: Record<string, unknown>; ratePlanCodes: string[] }>();
      for (const rp of cmSettings.ratePlans) {
        if (!rp.cancellationPolicy) continue;
        const key = JSON.stringify(rp.cancellationPolicy);
        if (!policyMap.has(key)) {
          policyMap.set(key, { payload: rp.cancellationPolicy as Record<string, unknown>, ratePlanCodes: [] });
        }
        policyMap.get(key)!.ratePlanCodes.push(rp.pmsRateplanCode);
      }

      for (const [, { payload, ratePlanCodes }] of policyMap) {
        sseEvent(reply, { type: 'progress', message: 'Creating cancellation policy...' });
        let policyCode: string;
        try {
          const result = await hgBoClient.createPolicy(propertyCode, payload);
          policyCode = result.policyCode;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('409') && !msg.includes('already')) throw err;
          continue;
        }
        for (const rpCode of ratePlanCodes) {
          await hgBoClient.linkPolicyToRatePlan(propertyCode, rpCode, policyCode).catch(() => {});
        }
      }
      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
      sseEvent(reply, { type: 'complete', stepId: step.id });

    } else if (step.id === 'create_taxes') {
      const propertyCode = session.hgPropertyCode;
      if (!propertyCode) throw new Error('No property code');
      const harvestedData = (session.harvestedData as Record<string, unknown>) ?? {};
      const taxes = (harvestedData['taxesAndFees'] as Array<{ name: string; amount: string | null }>) ?? [];
      const enriched = session.enrichedData as Record<string, unknown>;
      const taxRelations = (enriched?.['cmSettings'] as { taxRelations: Record<string, string> } | undefined)?.taxRelations ?? {};
      const cmSettings = (enriched?.['cmSettings'] as { ratePlans: Array<{ pmsRateplanCode: string }> } | undefined) ?? { ratePlans: [] };

      for (const tax of taxes) {
        sseEvent(reply, { type: 'progress', message: `Creating tax: ${tax.name}` });
        const relation = (taxRelations[tax.name] ?? 'add') as 'included' | 'add' | 'display' | 'optional' | 'ignore';
        try {
          await hgBoClient.createTaxFee(propertyCode, {
            title: tax.name,
            chargeType: 'percent',
            chargeValue: parseFloat(tax.amount?.replace(/[^0-9.]/g, '') ?? '0') || 0,
            category: 'tax',
            scope: 'per_room',
            frequency: 'per_night',
            defaultRatePlanRelation: relation,
          });
          for (const rp of cmSettings.ratePlans) {
            await hgBoClient.setRatePlanTaxes(propertyCode, rp.pmsRateplanCode, { [tax.name]: relation }).catch(() => {});
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('409') && !msg.includes('already')) throw err;
        }
      }

      // regionAware: flag for admin queue after all taxes are created
      if (flow.regionAware) {
        const existing = (session.enrichedData as Record<string, unknown>) ?? {};
        await prisma.onboardingSession.update({
          where: { id: sessionId },
          data: { enrichedData: { ...existing, adminActions: ['verify_siteminder_region'] } as any },
        });
      }

      await advanceStep(sessionId, stepIndex, { stepId: step.id, success: true });
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
