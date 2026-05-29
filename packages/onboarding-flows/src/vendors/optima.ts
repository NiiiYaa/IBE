import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const OPTIMA_PMS_ID = 37;

// Optima (by Silverbyte) onboarding flow (KB-verified):
// Standard blank flow. Content is collected automatically via IBE harvesting in the wizard.
// Most Optima properties are from Israel:
// - Check infant pricing configuration (many Israel properties have infant rates)
// - Check current Israel tax rules (may require special configuration)
// Support: liraz@silverbyte.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Optima',
    description: 'In your Optima (Silverbyte) account, go to Channel Manager and add HyperGuest using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const optimaFlow = createVendorFlow({
  pmsId: OPTIMA_PMS_ID,
  pmsName: 'Optima',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: true, // Israel properties require special tax and infant pricing config
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Optima Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Optima Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: OPTIMA_PMS_ID,
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
