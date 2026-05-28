import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

// TODO: verify SiteMinder pmsId via HG BO API /api/v1/integration/pms
const SITEMINDER_PMS_ID = 12;

// Build the steps: take blank flow defaults, then insert user_action between create_taxes and trigger_ari_sync
function buildSiteMinderSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in SiteMinder',
    description: 'Log in to your SiteMinder dashboard and add HyperGuest as a channel using your HyperGuest property code. Once done, click Continue.',
  });
  return steps;
}

export const siteMinderFlow = createVendorFlow({
  pmsId: SITEMINDER_PMS_ID,
  pmsName: 'SiteMinder',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: true,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'SiteMinder Property ID is required'),
  }),
  steps: buildSiteMinderSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) {
      return { valid: false, message: 'SiteMinder Property ID is required' };
    }
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: SITEMINDER_PMS_ID,
        location: {
          city: {
            name: (enriched['city'] as string) ?? 'Unknown',
            countryCode: (enriched['countryCode'] as string) ?? 'XX',
          },
        },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: {
          propertyId: ctx.credentials['propertyId'],
          pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room',
        },
        propertyCode: ctx.credentials['propertyId'],
        hasStaticData: false,
      },
    };
  },
});
