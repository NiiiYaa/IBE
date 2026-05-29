import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const SIMPLE_BOOKING_PMS_ID = 51;

// Simple Booking (SimpleBooking.it) as an ARI source / channel manager (no KB article — built generically).
// Note: SimpleBooking.it is also a known IBE (in known-ibe-registry.ts) — this flow is for when
// the hotel uses SimpleBooking as their CHANNEL MANAGER pushing ARI to HyperGuest.
// A harvester already exists for SimpleBooking IBE (simplebooking-harvester.ts).
// Verify credential requirements before production use.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Simple Booking',
    description: 'In your Simple Booking account, go to Channel Manager → Channels and add HyperGuest using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const simpleBookingFlow = createVendorFlow({
  pmsId: SIMPLE_BOOKING_PMS_ID,
  pmsName: 'Simple Booking',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: false,
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Simple Booking Hotel ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Simple Booking Hotel ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: SIMPLE_BOOKING_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: false,
      },
    };
  },
});
