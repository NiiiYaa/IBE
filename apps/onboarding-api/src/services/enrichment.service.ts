export interface EnrichedHotelData {
  hotelName: string;
  websiteUrl: string;
  contactEmail: string;
  city: string;
  countryCode: string;
  starRating?: number;
  roomCount?: number;
  credentials: Record<string, string>;
}

export function buildEnrichedData(input: {
  hotelName?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  credentials: Record<string, string>;
}): EnrichedHotelData {
  return {
    hotelName: input.hotelName ?? '',
    websiteUrl: input.websiteUrl ?? '',
    contactEmail: input.contactEmail ?? '',
    city: '',
    countryCode: '',
    credentials: input.credentials,
  };
}
