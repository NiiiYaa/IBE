import type { VendorFlow } from './types.js';
import { validateVendorFlow } from './factory.js';
import { siteMinderFlow } from './vendors/siteminder.js';

const registry = new Map<number, VendorFlow>([
  [siteMinderFlow.pmsId, siteMinderFlow],
]);

for (const flow of registry.values()) {
  validateVendorFlow(flow);
}

export function getVendorFlow(pmsId: number): VendorFlow | undefined {
  return registry.get(pmsId);
}
