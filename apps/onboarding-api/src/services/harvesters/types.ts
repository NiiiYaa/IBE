import type { HarvestedHotelData } from '@ibe/onboarding-flows';

export interface HarvestContext {
  checkIn: string;  // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
}

export interface IbeHarvester {
  harvest(
    ibeUrl: string,
    ctx: HarvestContext,
    onProgress: (message: string) => void,
  ): Promise<HarvestedHotelData>;
}
