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

export async function harvestFromUrl(
  rawUrl: string,
  onProgress: (msg: string) => void,
): Promise<HarvestedHotelData> {
  onProgress('Identifying booking engine...');
  const resolved = await resolveIbeUrl(rawUrl);
  if (!resolved) throw new Error('IBE URL unresolved — could not identify booking engine');

  const harvester = ibeHarvesterMap.get(resolved.ibeName);
  if (!harvester) throw new Error(`No harvester registered for IBE: ${resolved.ibeName}`);

  onProgress(`Detected: ${resolved.ibeName}. Starting harvest...`);
  return harvester.harvest(resolved.ibeUrl, dummyDates(), onProgress);
}
