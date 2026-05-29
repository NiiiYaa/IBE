import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const LIGHTHOUSE_PMS_ID = 43;

// Lighthouse Channel Manager (formerly Cubilis / Stardekk) onboarding flow (KB-verified):
// - Specific credentials required — property contacts Lighthouse support to obtain them
// Support: support@mylighthouse.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel', kind: 'user_action',
    title: 'Connect HyperGuest in Lighthouse',
    description: 'In your Lighthouse Channel Manager account, add HyperGuest as a channel using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const lighthouseFlow = createVendorFlow({
  pmsId: LIGHTHOUSE_PMS_ID, pmsName: 'Lighthouse', dataFlow: 'blank',
  requiresStaffChannelSetup: false, regionAware: false, kbVerified: true,
  preActions: [
    { title: 'Obtain connection credentials from Lighthouse', instruction: 'Contact Lighthouse Channel Manager support to request the credentials needed for the HyperGuest connection. Your HyperGuest contact can assist with this.', contactEmail: 'support@mylighthouse.com' },
  ],
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Lighthouse Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Lighthouse Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const e = ctx.enrichedData as Record<string, unknown>;
    return {
      property: { name: (e['hotelName'] as string) ?? 'My Hotel', pmsId: LIGHTHOUSE_PMS_ID, location: { city: { name: (e['city'] as string) ?? 'Unknown', countryCode: (e['countryCode'] as string) ?? 'XX' } }, isPilot: true, status: 'Incomplete' },
      propertySource: { data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' }, propertyCode: ctx.credentials['propertyId'], hasStaticData: false },
    };
  },
});
