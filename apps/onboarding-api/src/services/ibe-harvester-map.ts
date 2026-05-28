import type { IbeHarvester } from './harvesters/types.js';
import { SynXisHarvester } from './harvesters/synxis-harvester.js';
import { DirectBookHarvester } from './harvesters/direct-book-harvester.js';

export const ibeHarvesterMap = new Map<string, IbeHarvester>([
  ['Sabre SynXis', new SynXisHarvester()],
  ['direct-book.com', new DirectBookHarvester()],
]);
