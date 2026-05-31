import type { FastifyInstance, FastifyReply } from 'fastify';
import { initSession, initSelfRegistration } from '../services/session.service.js';

function setSessionCookie(reply: FastifyReply, sessionId: number) {
  reply.setCookie('onb_session', String(sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function sessionRoutes(app: FastifyInstance) {
  // POST /session — exchange invitation token for a session cookie (staff invite flow)
  app.post<{ Body: { token: string } }>('/session', async (request, reply) => {
    const { token } = request.body;
    if (!token) return reply.badRequest('token required');
    try {
      const session = await initSession(token);
      setSessionCookie(reply, session.id);
      return reply.send({ ok: true, sessionId: session.id });
    } catch (err: unknown) {
      return reply.badRequest(err instanceof Error ? err.message : 'Invalid token');
    }
  });

  // POST /register — self-registration (hotel fills public form, no prior invite)
  app.post<{ Body: { hotelName: string; pmsId?: number; unknownPmsName?: string; unknownPmsStatus?: 'to_be_added' | 'to_be_checked'; contactEmail: string; websiteUrl?: string } }>(
    '/register',
    async (request, reply) => {
      const { hotelName, pmsId, unknownPmsName, unknownPmsStatus, contactEmail, websiteUrl } = request.body;
      if (!hotelName || !contactEmail) return reply.badRequest('hotelName and contactEmail are required');
      if (!pmsId && !unknownPmsName) return reply.badRequest('pmsId or unknownPmsName is required');
      try {
        const result = await initSelfRegistration({
          hotelName,
          pmsId,
          unknownPmsName,
          unknownPmsStatus,
          contactEmail,
          ...(websiteUrl !== undefined ? { websiteUrl } : {}),
        });
        if (result.redirect === 'wizard' && result.sessionId) {
          setSessionCookie(reply, result.sessionId);
        }
        return reply.code(201).send({ ok: true, redirect: result.redirect });
      } catch (err: unknown) {
        return reply.badRequest(err instanceof Error ? err.message : 'Registration failed');
      }
    }
  );
}
