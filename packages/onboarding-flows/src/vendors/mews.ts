import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const MEWS_PMS_ID = 4;

// Mews onboarding flow (KB-verified):
// - Requires a Mews Channel Manager Code — a very long alphanumeric ID
//   (e.g. "15FBBFF9177241A0844E5752B5BA1A1A-41AB7CAF102ABC5417D3C65BBDE5E47")
// - Room and rate codes MUST match exactly between HG and Mews (no default codes)
// - Blank spaces and missing icons in codes cause connection failures

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Mews Commander',
    description: 'In Mews Commander, go to Settings → Integrations → Channel Managers and add HyperGuest using your Channel Manager Code. Room and rate codes in Mews must match exactly what was configured in the previous step. Once done, click Continue.',
  });
  return steps;
}

export const mewsFlow = createVendorFlow({
  pmsId: MEWS_PMS_ID,
  pmsName: 'Mews',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  useDefaultCodes: false, // Room/rate codes must match Mews exactly — no auto-generated defaults
  credentialsSchema: z.object({
    channelManagerCode: z.string().min(10, 'Mews Channel Manager Code is required — it is a long alphanumeric code from your Mews account (e.g. 15FBBFF9177241A0...)'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['channelManagerCode']) return { valid: false, message: 'Mews Channel Manager Code is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: MEWS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: ctx.credentials['channelManagerCode'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['channelManagerCode'],
        hasStaticData: false,
      },
    };
  },
});
