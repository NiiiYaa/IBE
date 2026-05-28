import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from './env.js';

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'development'
      ? { level: 'debug', transport: { target: 'pino-pretty' } }
      : { level: 'warn' },
  })

  await app.register(cors, {
    origin: env.ONBOARDING_APP_URL,
    credentials: true,
  });
  await app.register(cookie, { secret: env.SESSION_COOKIE_SECRET });
  await app.register(sensible);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
