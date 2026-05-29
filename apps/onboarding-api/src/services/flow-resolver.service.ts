import { prisma } from '../db/client.js';
import { getVendorFlow } from '@ibe/onboarding-flows';
import type { VendorFlow } from '@ibe/onboarding-flows';

export async function resolveVendorFlow(pmsId: number): Promise<VendorFlow | undefined> {
  const wl = await prisma.ariSourceWhiteLabel.findUnique({ where: { pmsId } });
  return getVendorFlow(wl?.whiteLabelOfPmsId ?? pmsId);
}
