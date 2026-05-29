import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const SHIJI_PMS_ID = 22;

// Shiji onboarding flow (KB-verified):
// Shiji is a Switch (not a Channel Manager) — connects hotel chains to HyperGuest.
// Process:
// 1. HG OB agent makes FIRST CONTACT with OB Point of Contact AND Shiji (sdsproduct@shijigroup.com)
//    in CC, confirming the order and requesting activation + mapping on their side.
//    Provide list of property IDs and chain codes if available from BD.
// 2. Required info: Property ID, Chain Code, ARI Type, Child Price Type, Tax setting
// 3. Property ID format: may need chain code appended (verify with Shiji per property)
//    Example: if hotel gives "12345" and chain is "XYZ", ID may be "XYZ12345"
// ARI Types:
//   Default — standard nightly rate pricing
//   LoS (Length of Stay) — used by Hilton/IHG; calendar shows total stay price
// Child Price Type:
//   Default — standard pricing
//   By Age Range — age-based pricing tiers
// Tax setting: Shiji always provides prices before AND after taxes.
//   Must verify whether taxes are included or excluded based on their setup.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'shiji_first_contact',
      kind: 'user_action',
      title: 'First Contact with Shiji',
      description: 'HyperGuest has contacted both your account manager and Shiji (sdsproduct@shijigroup.com) to request activation and property mapping. This step is managed by HyperGuest — no action required from you at this stage. Click Continue once your HyperGuest contact confirms the process has started.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm Shiji Mapping Complete',
      description: 'Once Shiji confirms the mapping is complete and ARI is flowing, your HyperGuest contact will notify you. Click Continue when notified.',
    }
  );
  return steps;
}

export const shijiFlow = createVendorFlow({
  pmsId: SHIJI_PMS_ID,
  pmsName: 'Shiji',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true, // First contact with Shiji required; chain code may need appending to property ID
  regionAware: false,
  kbVerified: true,
  preActions: [
    {
      title: 'Shiji activation is handled by HyperGuest',
      instruction: 'HyperGuest will contact Shiji (sdsproduct@shijigroup.com) directly to request activation and mapping for your property. Please ensure your HyperGuest account manager has your Shiji Property ID and Chain Code. You will be notified once the setup is complete.',
      contactEmail: 'sdsproduct@shijigroup.com',
    },
  ],
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Shiji Property ID is required'),
    chainCode:  z.string().min(1, 'Shiji Chain Code is required'),
    ariType:    z.enum(['Default', 'LoS']).default('Default'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Shiji Property ID is required' };
    if (!ctx.credentials['chainCode'])  return { valid: false, message: 'Shiji Chain Code is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    const propertyId = ctx.credentials['propertyId'] as string;
    const chainCode  = ctx.credentials['chainCode']  as string;
    // Chain code may need to be prepended to property ID — verify with Shiji per property
    const shijiId = `${chainCode}${propertyId}`;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: SHIJI_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: {
          propertyId: shijiId,
          chainCode,
          ariType: ctx.credentials['ariType'] ?? 'Default',
          pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room',
        },
        propertyCode: shijiId,
        hasStaticData: false,
      },
    };
  },
});
