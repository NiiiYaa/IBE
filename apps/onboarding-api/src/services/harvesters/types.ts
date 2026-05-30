import type { HarvestedHotelData } from '@ibe/onboarding-flows';
import type { HarvestResumeContext } from '../ibe-harvester.service.js';

export interface HarvestContext {
  checkIn: string;  // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
}

export interface IbeHarvester {
  harvest(
    ibeUrl: string,
    ctx: HarvestContext,
    onProgress: (message: string) => void,
    resume?: HarvestResumeContext,
  ): Promise<HarvestedHotelData>;
}
