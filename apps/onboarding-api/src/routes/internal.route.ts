import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { prisma } from '../db/client.js';
import { harvestFromUrl } from '../services/ibe-harvester.service.js';
import { invalidateBlockedDomainsCache } from '../services/blocked-domains.service.js';

// In-memory DataDome cookie store (24h TTL, reset on restart)
export const dataDomeCookies: Record<string, string> = {}

export async function internalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (secret !== env.INTERNAL_API_SECRET) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // POST /internal/harvest
  // Called by apps/api after invitation is created with an IBE URL.
  // Runs IBE harvester and reports result back to apps/api via callback.
  app.post<{ Body: { invitationId: number; ibeUrl: string } }>(
    '/internal/harvest',
    async (request, reply) => {
      const { invitationId, ibeUrl } = request.body;
      if (!invitationId || !ibeUrl) return reply.badRequest('invitationId and ibeUrl required');

      const callbackBase = process.env['IBE_API_CALLBACK_URL'] ?? 'http://localhost:3000';
      const secret = env.INTERNAL_API_SECRET;

      const HARVEST_TIMEOUT_MS = 120_000 // 2 minutes hard cap

      // Run harvest asynchronously — respond immediately so apps/api is not blocked
      setImmediate(async () => {
        try {
          const appendLog = (msg: string) => {
            const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}\n`
            console.log(`[harvest:${invitationId}] ${msg}`)
            prisma.$executeRaw`UPDATE "OnboardingInvitation" SET "harvestLog" = COALESCE("harvestLog", '') || ${line} WHERE id = ${invitationId}`.catch(() => {})
          }
          const harvestPromise = harvestFromUrl(ibeUrl, appendLog)
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Harvest timed out after ${HARVEST_TIMEOUT_MS / 1000}s`)), HARVEST_TIMEOUT_MS)
          )
          const harvestedData = await Promise.race([harvestPromise, timeoutPromise])
          await fetch(`${callbackBase}/internal/onboarding/harvest-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
            body: JSON.stringify({ invitationId, harvestedData }),
          });
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : 'Unknown harvest error';
          await fetch(`${callbackBase}/internal/onboarding/harvest-failed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
            body: JSON.stringify({ invitationId, reason }),
          }).catch(() => {});
        }
      });

      return reply.code(202).send({ ok: true });
    }
  );

  app.post<{ Body: { domain: string; cookie: string } }>('/internal/datadome-cookie', async (request, reply) => {
    const { domain, cookie } = request.body
    if (domain && cookie) dataDomeCookies[domain] = cookie
    return reply.send({ ok: true })
  })

  app.post('/internal/invalidate-blocked-cache', async (_request, reply) => {
    invalidateBlockedDomainsCache();
    return reply.send({ ok: true });
  });

}
