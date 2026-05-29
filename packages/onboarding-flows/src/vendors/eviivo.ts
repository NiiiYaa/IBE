import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const EVIIVO_PMS_ID = 66;

// eviivo onboarding flow (KB-verified):
// 1. Hotel contacts eviivo support to activate the HyperGuest channel
// 2. eviivo provides the hotel with a unique short code (e.g. Mission94103)
// 3. Hotel shares the short code with HyperGuest
// 4. HG creates the property shell using the short code; static data pulled from eviivo
// Note: eviivo MUST activate HyperGuest on their side BEFORE HG can create the property.
// Note: promotions/discounts configured in eviivo are NOT automatically applied on HG.
// requiresStaffChannelSetup: true — eviivo must activate the channel first.
// Support: support@eviivo.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'eviivo Channel Setup',
    description: 'HyperGuest will use your eviivo short code to set up the channel on our side. Room and rate data will be pulled from eviivo automatically. No further action is needed from you at this step — click Continue.',
  });
  return steps;
}

export const eviivoFlow = createVendorFlow({
  pmsId: EVIIVO_PMS_ID,
  pmsName: 'eviivo',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Contact eviivo to activate HyperGuest and obtain your short code',
      instruction: 'Contact eviivo support to request activation of the HyperGuest channel for your property. eviivo will provide you with a unique short code (e.g. Mission94103) — keep this ready for the wizard. Note: promotions and discounts configured in eviivo are not automatically applied on HyperGuest; they must be configured separately.',
      contactEmail: 'support@eviivo.com',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({
    shortCode: z.string().min(1, 'eviivo short code is required (e.g. Mission94103) — contact eviivo support if you do not have it'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['shortCode']) return { valid: false, message: 'eviivo short code is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: EVIIVO_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: ctx.credentials['shortCode'],
        hasStaticData: true,
      },
    };
  },
});
