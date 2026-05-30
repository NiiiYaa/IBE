import type { HarvestedHotelData } from '@ibe/onboarding-flows';
import { resolveIbeUrl } from './ibe-resolver.service.js';
import { ibeHarvesterMap } from './ibe-harvester-map.js';

function dummyDates(): { checkIn: string; checkOut: string } {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 30);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 1);
  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

export interface HarvestResumeContext {
  existingData: Record<string, unknown> | null
  completedSteps: string[]
  saveProgress: (stepKey: string, partialData?: Record<string, unknown>) => void
  reportIbeUrl?: (url: string) => void
}

export async function harvestFromUrl(
  rawUrl: string,
  onProgress: (msg: string) => void,
  resume?: HarvestResumeContext,
): Promise<HarvestedHotelData> {
  onProgress('Identifying booking engine...');
  const resolved = await resolveIbeUrl(rawUrl);
  if (!resolved) throw new Error('IBE URL unresolved — could not identify booking engine');
  onProgress(`  → ${resolved.ibeName} (hotel ID: ${resolved.hotelId ?? 'n/a'})`)

  const harvester = ibeHarvesterMap.get(resolved.ibeName);
  if (!harvester) throw new Error(`No harvester registered for IBE: ${resolved.ibeName}`);

  onProgress(`Starting harvest...`);
  return harvester.harvest(resolved.ibeUrl, dummyDates(), onProgress, resume);
}
