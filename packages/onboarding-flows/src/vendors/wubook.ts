import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const WUBOOK_PMS_ID = 62;

// WuBook / WooDoo onboarding flow (no KB article — built generically).
// WuBook is a popular European (Italy/Mediterranean) PMS and channel manager.
// Also known as WooDoo (their channel manager product).
// Verify credential requirements before production use.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in WuBook',
    description: 'In your WuBook account, go to WooDoo (Channel Manager) → Channels and add HyperGuest using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const wuBookFlow = createVendorFlow({
  pmsId: WUBOOK_PMS_ID,
  pmsName: 'WuBook',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: false,
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'WuBook Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'WuBook Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: WUBOOK_PMS_ID,
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
