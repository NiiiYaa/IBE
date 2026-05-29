import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const ZOTEL_PMS_ID = 170;

// Zotel onboarding flow (KB-verified, certified 2025-09-23):
// Generic partner integration (developed by Zotel to HG's spec).
// - No credential needed for shell creation
// - They use HG's own room/rate IDs — no code matching needed
// - They push ARI to HG; HG pushes reservations to Zotel
// - NO children or infants supported — adult prices only
//   If a guest searches for 1 adult + 1 child, offer the option for 2 adults instead
// Support: nikhiln.14@gmail.com | niral.kpyxal@gmail.com | abhijit.debbarma@zotel.ai

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Zotel',
    description: 'In your Zotel account, activate HyperGuest as a channel. Note: children and infant pricing is not supported — only adult prices will be displayed. Once done, click Continue.',
  });
  return steps;
}

export const zotelFlow = createVendorFlow({
  pmsId: ZOTEL_PMS_ID,
  pmsName: 'Zotel',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({}), // No credential — Zotel uses HG's own IDs
  steps: buildSteps(),
  async validateConnection(_ctx) { return { valid: true }; },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: ZOTEL_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '', hasStaticData: false,
      },
    };
  },
});
