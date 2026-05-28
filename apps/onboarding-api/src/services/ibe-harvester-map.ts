import type { IbeHarvester } from './harvesters/types.js';
import { SynXisHarvester } from './harvesters/synxis-harvester.js';

export const ibeHarvesterMap = new Map<string, IbeHarvester>([
  ['Sabre SynXis', new SynXisHarvester()],
]);
