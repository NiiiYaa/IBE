import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const RMS_PMS_ID = 65;

// RMS (RMS Cloud) onboarding flow (KB-verified, certified 29/06/23):
// - No credential needed for HG to create the shell
// - RMS pushes ARI to HG; rooms and rate list provided by CM
// - Reservations: HG pushes to RMS and they are confirmed immediately
// IMPORTANT TAX NOTE (Jira INT-388):
//   RMS treats AmountBeforeTax the same as AmountAfterTax.
//   HG sends the same value for both fields, with taxes always included in the amount.
//   Tax setup: taxes are always INCLUDED in what HG sends to RMS.
// Support: jho@rmscloud.com (Jessica)

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in RMS',
    description: 'In your RMS Cloud account, activate HyperGuest as a channel. RMS will begin pushing availability and rates automatically. Note: tax amounts are handled with taxes included. Once done, click Continue.',
  });
  return steps;
}

export const rmsFlow = createVendorFlow({
  pmsId: RMS_PMS_ID,
  pmsName: 'RMS',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({}), // No credential needed
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: RMS_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // Taxes are always included in amounts sent to RMS (INT-388 known issue)
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room', taxInclusive: true },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
