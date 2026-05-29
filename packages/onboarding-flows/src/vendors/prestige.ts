import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const PRESTIGE_PMS_ID = 52;

// Prestige onboarding flow (KB-verified):
// IMPORTANT RATE CODE FORMAT:
//   HG rate codes must have the board code appended with a hyphen.
//   Example: hotel rate "Flex-BB" (board: BB) → stored in HG as "Flex-BB-BB"
//   When instructing the hotel or OB agent: only tell them "Flex-BB" (without the last "-BB")
//   The ratePlanCodeTransform handles this automatically.
// OCCUPANCIES:
//   Each property has a base occupancy (usually 2 or 3 adults).
//   Children, infants, and adults above the base are configured as extras.
//   Occupancies must be set BEFORE the hotel pushes ARI (otherwise prices display incorrectly).
// Support: channels@cloudhospitality.com | ignaciol@prestige-soft.com (escalations)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Prestige',
    description: 'In your Prestige account, map the rate plans using the codes your HyperGuest contact provided (e.g. "Flex-BB" — do not add the board code suffix yourself). Confirm occupancy base is set correctly. Once mapping is complete, click Continue.',
  });
  return steps;
}

export const prestigeFlow = createVendorFlow({
  pmsId: PRESTIGE_PMS_ID,
  pmsName: 'Prestige',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  // Prestige rate code = entered code + "-" + board code (e.g. "Flex-BB" + "BB" = "Flex-BB-BB")
  ratePlanCodeTransform: (code, boardCode) => `${code}-${boardCode}`,
  credentialsSchema: z.object({
    propertyId: z.string().min(1, 'Prestige Property ID is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['propertyId']) return { valid: false, message: 'Prestige Property ID is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: PRESTIGE_PMS_ID,
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
