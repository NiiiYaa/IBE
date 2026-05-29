import { z } from 'zod';
import { createVendorFlow, defaultStepsFor } from '../factory.js';

const BOOKINGHOTEL_PMS_ID = 148;

// BookingHotel onboarding flow (KB-verified):
// Certified 2024-10-21. Generic HG-spec integration.
// - They pull static data from HG (no hasStaticData needed)
// - They push ARI to us (blank flow)
// - We push reservations to them (confirmed immediately)
// - No credentials needed from hotel
// Support: bookinghotels.in@gmail.com

export const bookingHotelFlow = createVendorFlow({
  pmsId: BOOKINGHOTEL_PMS_ID,
  pmsName: 'BookingHotel',
  dataFlow: 'blank',
  requiresStaffChannelSetup: false,
  regionAware: false,
  kbVerified: true,
  credentialsSchema: z.object({}),
  steps: defaultStepsFor('blank'),
  async validateConnection(_ctx) {
    return { valid: true };
  },
  getHGPropertyPayload(ctx) {
    const enriched = ctx.enrichedData as Record<string, unknown>;
    return {
      property: {
        name: (enriched['hotelName'] as string) ?? 'My Hotel',
        pmsId: BOOKINGHOTEL_PMS_ID,
        location: { city: { name: (enriched['city'] as string) ?? 'Unknown', countryCode: (enriched['countryCode'] as string) ?? 'XX' } },
        isPilot: true, status: 'Incomplete',
      },
      propertySource: {
        data: { pricingModel: ctx.cmSettings?.pricingModel ?? 'per_room' },
        propertyCode: '', hasStaticData: false,
      },
    };
  },
});
