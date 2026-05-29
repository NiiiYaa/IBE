import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const CHANNEX_PMS_ID = 24;

// Channex onboarding flow (KB-verified):
// Standard process for all regions except LATAM.
// LATAM properties may use Channex via PXSOL (equipo@pxsol.com) or WINPAX (winpaxweb@hotelmansa.com)
// — for those, HG staff must copy the partner on the onboarding email.
// Support: support@channex.io

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Channex',
    description: 'In your Channex account, go to Connections → New Connection and add HyperGuest using your HyperGuest property code. If you are in Latin America and use PXSOL or WINPAX, please contact your provider directly to complete the mapping. Once done, click Continue.',
  });
  return steps;
}

export const channexFlow = createVendorFlow({
  pmsId: CHANNEX_PMS_ID,
  pmsName: 'Channex',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  kbVerified: true,
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Channex Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Channex Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: CHANNEX_PMS_ID,
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
