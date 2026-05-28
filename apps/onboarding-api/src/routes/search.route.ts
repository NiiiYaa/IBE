import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { searchHotels, SCREENSHOTS_DIR, cleanExpiredScreenshots } from '../services/hotel-search.service.js';
import { resolveIbeUrl } from '../services/ibe-resolver.service.js';
import { prisma } from '../db/client.js';
import { getSession, advanceStep } from '../services/session.service.js';

function getSessionIdFromCookie(request: any): number | null {
  const raw = request.cookies?.['onb_session'];
  if (!raw) return null;
  const parsed = parseInt(raw);
  return isNaN(parsed) ? null : parsed;
}

export async function searchRoutes(app: FastifyInstance) {
  // Serve screenshots with TTL cleanup
  app.get<{ Params: { file: string } }>('/screenshots/:file', async (request, reply) => {
    // Prevent path traversal
    const safeName = path.basename(request.params.file);
    const filePath = path.join(SCREENSHOTS_DIR, safeName);
    if (!fs.existsSync(filePath)) return reply.notFound();
    // Clean expired screenshots opportunistically
    cleanExpiredScreenshots().catch(() => {});
    const stream = fs.createReadStream(filePath);
    return reply.type('image/png').send(stream);
  });

  // POST /hotel-search — DuckDuckGo search + screenshots (~10-15s)
  app.post<{ Body: { hotelName: string; city: string; country: string } }>(
    '/hotel-search',
    async (request, reply) => {
      const { hotelName, city, country } = request.body;
      if (!hotelName?.trim()) return reply.badRequest('hotelName is required');
      const candidates = await searchHotels(hotelName.trim(), city?.trim() ?? '', country?.trim() ?? '');
      return reply.send({ candidates });
    }
  );

  // POST /select-url — resolve IBE from URL async; client polls GET /wizard/state
  app.post<{ Body: { url: string } }>(
    '/select-url',
    async (request, reply) => {
      const sessionId = getSessionIdFromCookie(request);
      if (!sessionId) return reply.unauthorized('No session');
      const session = await getSession(sessionId);
      if (!session) return reply.notFound();

      const { url } = request.body;
      if (!url?.trim()) return reply.badRequest('url required');

      // Fire resolution asynchronously — respond 202 immediately
      setImmediate(async () => {
        try {
          const resolved = await resolveIbeUrl(url.trim());
          if (resolved) {
            await prisma.onboardingInvitation.update({
              where: { id: session.invitation.id },
              data: { ibeUrl: resolved.ibeUrl, ibePattern: resolved.ibeName },
            });
            await advanceStep(sessionId, session.currentStep, {
              stepId: 'candidate_search',
              success: true,
              data: { ibeName: resolved.ibeName, ibeUrl: resolved.ibeUrl },
            });
          } else {
            await prisma.onboardingSession.update({
              where: { id: sessionId },
              data: { status: 'pending_ibe_review' },
            });
          }
        } catch {
          await prisma.onboardingSession.update({
            where: { id: sessionId },
            data: { status: 'pending_ibe_review' },
          }).catch(() => {});
        }
      });

      return reply.code(202).send({ ok: true });
    }
  );
}
