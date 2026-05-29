import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const TRAVELLINE_PMS_ID = 124;

// Travelline onboarding flow (KB-verified).
// POC: Julia Plotnikova — julia.plotnikova@travelline.pro
// When hotel requests HG connection in Travelline, HG receives 2 emails:
//   1. CONNECT — hotel requested connection
//   2. ACTIVE — connection is live
// These emails may arrive at support@hyperguest.com (not onboarding@hyperguest.com).
// Staff must verify Travelline Property ID from the CONNECT email.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Enable HyperGuest in Travelline',
    description:
      'In your Travelline account, go to Channel Manager → Add Channel → HyperGuest. Request the connection. ' +
      'You will receive a confirmation email when HyperGuest accepts (within 1 business day). ' +
      'Check your inbox for emails from Travelline with your Travelline Property ID — you will need it below.',
  });
  return steps;
}

export const travellineFlow = createVendorFlow({
  pmsId: TRAVELLINE_PMS_ID,
  pmsName: 'Travelline',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Travelline Property ID is required (from the Travelline CONNECT email)'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) {
      return { valid: false, message: 'Travelline Property ID is required' };
    }
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: TRAVELLINE_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['propertyId'], hasStaticData: false,
      },
    };
  },
});
