import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';
const STAYS_PMS_ID = 15;
function buildSteps() {
  const steps = defaultStepsFor('blank');
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, { id: 'connect_channel', kind: 'user_action', title: 'Connect HyperGuest in Stays', description: 'In your Stays account, add HyperGuest as a channel using your HyperGuest property code. Once done, click Continue.' });
  return steps;
}
export const staysFlow = createVendorFlow({ pmsId: STAYS_PMS_ID, pmsName: 'Stays', dataFlow: 'blank', requiresStaffChannelSetup: false, regionAware: false, kbVerified: false,
  credentialsSchema: z.object({ propertyId: z.string().min(1, 'Stays Property ID is required') }),
  steps: buildSteps(),
  async validateConnection(ctx) { if (!ctx.credentials['propertyId']) return { valid: false, message: 'Stays Property ID is required' }; return { valid: true }; },
  getHGPropertyPayload(ctx) { const e = ctx.enrichedData as Record<string, unknown>; return { property: { name: (e['hotelName'] as string) ?? 'My Hotel', pmsId: STAYS_PMS_ID, location: { city: { name: (e['city'] as string) ?? 'Unknown', countryCode: (e['countryCode'] as string) ?? 'XX' } }, isPilot: true, status: 'Incomplete' }, propertySource: { data: { propertyId: ctx.credentials['propertyId'], pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' }, propertyCode: ctx.credentials['propertyId'], hasStaticData: false } }; }
});
