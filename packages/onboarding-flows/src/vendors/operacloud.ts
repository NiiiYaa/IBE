import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const OPERACLOUD_PMS_ID = 32;

// Opera Cloud by Oracle onboarding flow — no KB article found; built from standard template.
// kbVerified: false — verify credentials and connection steps with Oracle Hospitality support before production use.
// requiresStaffChannelSetup: true — enterprise Oracle PMS always requires staff coordination.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);
  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0, {
    id: 'connect_channel',
    kind: 'user_action',
    title: 'Connect HyperGuest in Opera Cloud by Oracle',
    description: 'Opera Cloud by Oracle requires coordination with Oracle Hospitality. Your HyperGuest contact will work directly with Oracle to complete the channel setup. Click Continue when notified by HyperGuest.',
  });
  return steps;
}

export const operaCloudFlow = createVendorFlow({
  pmsId: OPERACLOUD_PMS_ID,
  pmsName: 'Opera Cloud by Oracle',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: false,
  regionAware: false,
  credentialsSchema: z.object({}),
  steps: buildSteps(),
  async validateConnection(_ctx) { return { valid: true }; },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: OPERACLOUD_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
