import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const TODOALOJAMIENTO_PMS_ID = 21;

// TodoAlojamiento onboarding flow (KB-verified):
// Spanish-speaking channel manager.
// Process:
// 1. Hotel contacts Todoalojamiento to create "Objetivo de login" and complete mapping
// 2. Once done, hotel provides their Todoalojamiento property ID to HG
// 3. HG creates the property shell
// Room/rate codes managed by Todoalojamiento (their own codes).
// requiresStaffChannelSetup: true — Todoalojamiento must act before HG can create the shell.
// Support: soporte@todoalojamiento.com

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'request_todoalojamiento_setup',
      kind: 'user_action',
      title: 'Request Setup from Todoalojamiento',
      description: 'Contact Todoalojamiento support (soporte@todoalojamiento.com) and ask them to create the "Objetivo de login" and complete the property mapping for HyperGuest. Once they confirm, share your Todoalojamiento Property ID with your HyperGuest contact. Click Continue when done.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm Connection',
      description: 'Once HyperGuest has created your property profile, Todoalojamiento will begin pushing availability and rates. Your HyperGuest contact will notify you when the connection is active. Click Continue.',
    }
  );
  return steps;
}

export const todoAlojamientoFlow = createVendorFlow({
  pmsId: TODOALOJAMIENTO_PMS_ID,
  pmsName: 'TodoAlojamiento',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  regionAware: false,
  kbVerified: true,
  preActions: [
    {
      title: 'Request login objective and mapping from Todoalojamiento',
      instruction: 'Contact Todoalojamiento support and ask them to create the "Objetivo de login" and complete the HyperGuest mapping for your property. Without this step HyperGuest cannot create your profile. Once complete, share your Todoalojamiento Property ID with your HyperGuest contact.',
      contactEmail: 'soporte@todoalojamiento.com',
    },
  ],
  credentialsSchema: z.object({}), // Property ID received after Todoalojamiento completes setup
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: TODOALOJAMIENTO_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
