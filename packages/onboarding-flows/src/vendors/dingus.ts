import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const DINGUS_PMS_ID = 11;

// Dingus onboarding flow (KB-verified):
// HG uses fixed credentials for all Dingus properties:
//   Username: hyperguest (EXACT — lowercase, no trailing spaces, connection is case-sensitive)
//   Password: hY5268gT
// Hotel must provide: Dingus Property ID, Dingus URL, Chain code.
// Additional requirements:
// - Rate plans must be created manually in HG to match Dingus codes
// - Occupancies must be configured per hotel info
// - Age ranges required for correct mapping
// - VCC: sent from HG to Dingus; hotel must check if their PMS supports it
// Content: collected via IBE harvesting in the wizard
// Support: channels.support@dingus.es | Escalations: milena.galindo@dingus.es

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Confirm Dingus Connection',
    description: 'HyperGuest will activate the channel in Dingus using your Dingus ID and the standard HyperGuest credentials. Your HyperGuest contact will configure the rate plans and occupancies to match your Dingus setup. Once confirmed, click Continue.',
  });
  return steps;
}

export const dingusFlow = createVendorFlow({
  pmsId: DINGUS_PMS_ID,
  pmsName: 'Dingus',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true, // HG activates with fixed credentials; rate plans created manually
  regionAware: false,
  credentialsSchema: z.object({
    dingusId:  z.string().min(1, 'Dingus Property ID is required'),
    dingusUrl: z.string().min(1, 'Dingus URL is required'),
    chain:     z.string().min(1, 'Dingus Chain code is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['dingusId'])  return { valid: false, message: 'Dingus Property ID is required' };
    if (!ctx.credentials['dingusUrl']) return { valid: false, message: 'Dingus URL is required' };
    if (!ctx.credentials['chain'])     return { valid: false, message: 'Dingus Chain code is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: DINGUS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: {
          propertyId: ctx.credentials['dingusId'],
          dingusUrl:  ctx.credentials['dingusUrl'],
          chain:      ctx.credentials['chain'],
          // HG fixed credentials: username=hyperguest, password=hY5268gT (set by HG staff)
          pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room',
        },
        propertyCode: ctx.credentials['dingusId'],
        hasStaticData: false,
      },
    };
  },
});
