import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';

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

      // Run harvest asynchronously — respond immediately so apps/api is not blocked
      setImmediate(async () => {
        try {
          // TODO: replace stub with actual ibe-harvester.service.ts call
          // const harvestedData = await ibeHarvesterService.harvest(ibeUrl);
          const harvestedData = null; // placeholder until harvester is built

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
}
