import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const ROOMCLOUD_PMS_ID = 14;

// RoomCloud / Parity onboarding flow (KB-verified):
// Also known as CM Reservas (LATAM) and IP Hoteles (LATAM).
// Process:
// 1. Hotel contacts their RoomCloud support to request HyperGuest be added as a channel.
//    - LATAM/CM Reservas: soporte@cmreservas.com
//    - LATAM/IP Hoteles: soporte@ip-hoteles.com
//    - Non-LATAM: support@roomcloud.net
// 2. RoomCloud support maps the rooms and rate plans.
// 3. RoomCloud informs HG that the property is active and provides the RoomCloud Property ID.
// 4. HG creates the property shell using that RoomCloud Property ID.
// Note: if created before mapping is complete, rooms/rates will not appear.
//       Can recreate with same ID to override and pull mapping again.
// requiresStaffChannelSetup: true — HG must wait for RoomCloud confirmation email.

function buildSteps() {
  const steps = defaultStepsFor('blank');
  const credIdx = steps.findIndex(s => s.id === 'collect_credentials');
  if (credIdx !== -1) steps.splice(credIdx, 1);

  const triggerIdx = steps.findIndex(s => s.id === 'trigger_ari_sync');
  steps.splice(triggerIdx, 0,
    {
      id: 'request_roomcloud_mapping',
      kind: 'user_action',
      title: 'Request HyperGuest Activation in RoomCloud',
      description: 'Contact your RoomCloud support team and ask them to add HyperGuest as a new channel and complete the room/rate mapping:\n• Latin America (CM Reservas): soporte@cmreservas.com\n• Latin America (IP Hoteles): soporte@ip-hoteles.com\n• All other regions: support@roomcloud.net\n\nOnce they confirm and provide your RoomCloud Property ID, share it with your HyperGuest contact. Click Continue when done.',
    },
    {
      id: 'connect_channel',
      kind: 'user_action',
      title: 'Confirm RoomCloud Connection',
      description: 'Once HyperGuest has created your property profile using the RoomCloud Property ID, verify that your rooms and rates are visible. Then click Continue to trigger the availability sync.',
    }
  );
  return steps;
}

export const roomCloudFlow = createVendorFlow({
  pmsId: ROOMCLOUD_PMS_ID,
  pmsName: 'RoomCloud',
  dataFlow: 'blank',
  requiresStaffChannelSetup: true,
  kbVerified: true,
  preActions: [
    {
      title: 'Request HyperGuest channel from RoomCloud',
      instruction: 'Contact your RoomCloud support team and ask them to add HyperGuest as a new channel and complete the room and rate plan mapping. Once the mapping is done, ask them to share your RoomCloud Property ID with HyperGuest. Support contacts: Latin America (CM Reservas): soporte@cmreservas.com | Latin America (IP Hoteles): soporte@ip-hoteles.com | All other regions: support@roomcloud.net',
      contactEmail: 'support@roomcloud.net',
    },
  ],
  regionAware: false,
  credentialsSchema: z.object({}), // RoomCloud Property ID is provided by RoomCloud to HG staff, not the hotel
  steps: buildSteps(),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: ROOMCLOUD_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true,
        status: 'Incomplete',
      },
      propertySource: {
        // RoomCloud Property ID is received from RoomCloud staff and set by HG staff in back-office
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '',
        hasStaticData: false,
      },
    };
  },
});
