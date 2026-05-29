import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const NEXTPAX_PMS_ID = 29;

// NextPax onboarding flow (KB-verified):
// Complex credential setup — NextPax uses a "multi-unite" hierarchy:
// - Multi-Unite ID = the "hotel code" in HG (groups multiple units under one property)
// - NextPax House IDs = room codes in HG (one per room type)
// Process:
// 1. Hotel requests their Multi-Unite ID and House IDs from NextPax support
// 2. HG validates with NextPax that units are indeed grouped under one multi-unite
// 3. Multi-Unite ID becomes the hotel code; House IDs become room codes
// Support: support.api@nextpax.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    { id: 'nextpax_validate', kind: 'user_action', title: 'Provide NextPax IDs', description: 'Contact NextPax support (support.api@nextpax.com) to obtain your Multi-Unite ID and the House IDs for each room type. Share these with your HyperGuest contact who will validate them and configure the room codes. Once confirmed, click Continue.' },
    { id: 'connect_channel', kind: 'user_action', title: 'Confirm NextPax Connection', description: 'Once HyperGuest has set up your property using your NextPax IDs, click Continue to trigger the first availability and rates sync.' }
  );
  return steps;
}

export const nextPaxFlow = createVendorFlow({
  pmsId: NEXTPAX_PMS_ID, pmsName: 'NextPax', dataFlow: 'blank',
  requiresStaffChannelSetup: true, regionAware: false, kbVerified: true,
  preActions: [
    { title: 'Obtain your NextPax Multi-Unite ID and House IDs', instruction: 'Contact NextPax support and request: (1) your Multi-Unite ID — this groups all your room units under one property, and (2) the NextPax House ID for each room type. Share both with your HyperGuest contact.', contactEmail: 'support.api@nextpax.com' },
  ],
  credentialsSchema: z.object({
    multiUniteId: z.string().min(1, 'NextPax Multi-Unite ID is required (the grouping ID for all your room units)'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['multiUniteId']) return { valid: false, message: 'NextPax Multi-Unite ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const e = ctx.enrichedData as Record<string, unknown>;
    return {
      property: { name: (e['hotelName'] as string) ?? 'My Hotel', pmsId: NEXTPAX_PMS_ID, location: { city: { name: (e['city'] as string) ?? 'Unknown', countryCode: (e['countryCode'] as string) ?? 'XX' } }, isPilot: true, status: 'Incomplete' },
      propertySource: { data: { propertyId: ctx.credentials['multiUniteId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' }, propertyCode: ctx.credentials['multiUniteId'], hasStaticData: false },
    };
  },
});
