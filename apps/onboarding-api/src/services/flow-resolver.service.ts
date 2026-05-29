import { prisma } from '../db/client.js';
import { getVendorFlow } from '@ibe/onboarding-flows';
import type { VendorFlow } from '@ibe/onboarding-flows';

// Single-hop resolution only. A→B is supported; A→B→C is not (B's flow runs, not C's).
// When a WL mapping exists, the master's getHGPropertyPayload runs — meaning the HG
// property is registered under the master's pmsId. This is intentional: white-label CMs
// share the same ARI channel as their master.
export async function resolveVendorFlow(pmsId: number): Promise<VendorFlow | undefined> {
  if (pmsId === 0) return undefined;
  const wl = await prisma.ariSourceWhiteLabel.findUnique({ where: { pmsId } });
  return getVendorFlow(wl?.whiteLabelOfPmsId ?? pmsId);
}
