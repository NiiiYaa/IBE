import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const DERBYSOFT_V2_PMS_ID = 98;

// DerbySoft v2 onboarding flow — no KB article found; built as Switch stub.
// kbVerified: false — verify property ID format, contact details, and connection steps with DerbySoft before production use.
// DerbySoft v2 is a newer integration version of the DerbySoft distribution Switch.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'derbysoft_v2_first_contact',
      kind: 'user_action',
      title: 'First Contact with DerbySoft',
      description: 'HyperGuest will contact DerbySoft to request activation and property mapping. This step is managed by HyperGuest — no action required from you at this stage. Click Continue once your HyperGuest contact confirms the process has started.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm DerbySoft Mapping Complete',
      description: 'Once DerbySoft confirms the mapping is complete and ARI is flowing, your HyperGuest contact will notify you. Click Continue when notified.',
    }
  );
  return steps;
}

export const derbysoftV2Flow = createVendorFlow({
  pmsId: DERBYSOFT_V2_PMS_ID,
  pmsName: 'DerbySoft v2',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: false,
  regionAware: false,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'DerbySoft Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'DerbySoft Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    const propertyId = ctx.credentials['propertyId'] as string;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: DERBYSOFT_V2_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: {
          propertyId,
          pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room',
        },
        propertyCode: propertyId,
        hasStaticData: false,
      },
    };
  },
});
