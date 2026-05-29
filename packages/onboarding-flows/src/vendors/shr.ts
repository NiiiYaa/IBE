import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const SHR_PMS_ID = 91;

// SHR (Sceptre Hospitality Resources / Windsurfer CRS) onboarding flow (KB-verified, certified 29/07/24):
// - CM ID and Chain Code both required
// - CM provides basic room/rate configuration
// - Rooms/rates retrieved from source with mapping; codes must match
// - They push ARI to HG

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel', kind: 'user_action',
    title: 'Connect HyperGuest in SHR Windsurfer',
    description: 'In your SHR Windsurfer account, activate HyperGuest as a channel. Room and rate codes must match between SHR and HyperGuest. Once done, click Continue.',
  });
  return steps;
}

export const shrFlow = createVendorFlow({
  pmsId: SHR_PMS_ID, pmsName: 'SHR', dataFlow: 'blank',
  requiresStaffChannelSetup: false, regionAware: false, kbVerified: true,
  credentialsSchema: z.object({
    cmId:      z.string().min(1, 'SHR CM ID is required'),
    chainCode: z.string().min(1, 'SHR Chain Code is required'),
  }),
  steps: buildSteps(),
  async validateConnection(ctx) {
    if (!ctx.credentials['cmId'])      return { valid: false, message: 'SHR CM ID is required' };
    if (!ctx.credentials['chainCode']) return { valid: false, message: 'SHR Chain Code is required' };
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const e = ctx.enrichedData as Record<string, unknown>;
    return {
      property: { name: (e['hotelName'] as string) ?? 'My Hotel', pmsId: SHR_PMS_ID, location: { city: { name: (e['city'] as string) ?? 'Unknown', countryCode: (e['countryCode'] as string) ?? 'XX' } }, isPilot: true, status: 'Incomplete' },
      propertySource: { data: { propertyId: ctx.credentials['cmId'], chainCode: ctx.credentials['chainCode'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' }, propertyCode: ctx.credentials['cmId'], hasStaticData: true },
    };
  },
});
