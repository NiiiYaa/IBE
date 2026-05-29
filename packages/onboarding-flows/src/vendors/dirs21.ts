import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const DIRS21_PMS_ID = 34;

// DIRS21 onboarding flow (KB-verified):
// - Specific DIRS21 Property ID required (from the engagement BD note, or request via template)
// - Standard blank flow
// Support: support@service.dirs21.de

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in DIRS21',
    description: 'In your DIRS21 account, go to Channel Manager → Channels and add HyperGuest using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const dirs21Flow = createVendorFlow({
  pmsId: DIRS21_PMS_ID,
  pmsName: 'DIRS21',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'DIRS21 Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'DIRS21 Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: DIRS21_PMS_ID,
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
