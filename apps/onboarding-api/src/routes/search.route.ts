import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { searchHotelsPrimary, searchHotelsBrave, SCREENSHOTS_DIR, cleanExpiredScreenshots, takeScreenshot } from '../services/hotel-search.service.js';
import { resolveIbeUrl } from '../services/ibe-resolver.service.js';
import { ibeHarvesterMap } from '../services/ibe-harvester-map.js';
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

  // POST /screenshot — take a screenshot of a single URL (called by frontend progressively)
  app.post<{ Body: { url: string } }>('/screenshot', async (request, reply) => {
    const { url } = request.body;
    if (!url?.trim()) return reply.badRequest('url required');
    const screenshotUrl = await takeScreenshot(url.trim());
    return reply.send({ screenshotUrl });
  });

  // POST /hotel-search — DataForSEO SERP primary search (~2s)
  app.post<{ Body: { hotelName: string; city: string; country: string; dfsLogin?: string; dfsPassword?: string } }>(
    '/hotel-search',
    async (request, reply) => {
      const { hotelName, city, country, dfsLogin, dfsPassword } = request.body;
      if (!hotelName?.trim()) return reply.badRequest('hotelName is required');
      const candidates = await searchHotelsPrimary(hotelName.trim(), city?.trim() ?? '', country?.trim() ?? '', dfsLogin, dfsPassword);
      return reply.send({ candidates });
    }
  );

  // POST /hotel-search/brave — Brave Playwright search (last resort, slow ~40s)
  app.post<{ Body: { hotelName: string; city: string; country: string } }>(
    '/hotel-search/brave',
    async (request, reply) => {
      const { hotelName, city, country } = request.body;
      if (!hotelName?.trim()) return reply.badRequest('hotelName is required');
      const candidates = await searchHotelsBrave(hotelName.trim(), city?.trim() ?? '', country?.trim() ?? '');
      return reply.send({ candidates });
    }
  );

  // GET /supported-ibes — list IBE patterns that have a harvester built
  app.get('/supported-ibes', async (_request, reply) => {
    return reply.send({ supported: Array.from(ibeHarvesterMap.keys()) })
  })

  // GET /chrome-debug/status — check if a Chrome CDP endpoint is reachable
  app.get('/chrome-debug/status', async (_request, reply) => {
    const debugUrl = process.env['CHROME_DEBUG_URL'] ?? 'http://localhost:9222'
    try {
      const res = await fetch(`${debugUrl}/json/version`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const data = await res.json() as { Browser?: string }
        return reply.send({ connected: true, browser: data.Browser ?? 'Chrome' })
      }
    } catch {}
    return reply.send({ connected: false })
  })

  // POST /chrome-debug/launch — spawn Chrome with remote debugging enabled
  app.post('/chrome-debug/launch', async (_request, reply) => {
    const debugUrl = process.env['CHROME_DEBUG_URL'] ?? 'http://localhost:9222'
    // Check if already running
    try {
      const res = await fetch(`${debugUrl}/json/version`, { signal: AbortSignal.timeout(1000) })
      if (res.ok) return reply.send({ ok: true, alreadyRunning: true })
    } catch {}

    const port = new URL(debugUrl).port || '9222'
    const args = [`--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--new-window']

    // Resolve executable: system Chrome first, then Playwright's bundled Chromium
    const { execSync } = await import('child_process')
    const systemCandidates = ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']
    let executablePath: string | null = null
    for (const bin of systemCandidates) {
      try { executablePath = execSync(`which ${bin}`, { encoding: 'utf8' }).trim(); break } catch {}
    }
    if (!executablePath) {
      // Fall back to Playwright's own bundled Chromium
      try {
        const { chromium: pw } = await import('playwright')
        executablePath = pw.executablePath()
      } catch {}
    }
    if (!executablePath) return reply.send({ ok: false, alreadyRunning: false })

    // Spawn with proper error handling (spawn errors are async)
    const launched = await new Promise<boolean>(resolve => {
      try {
        const child = spawn(executablePath!, args, { detached: true, stdio: 'ignore' })
        child.once('spawn', () => { child.unref(); resolve(true) })
        child.once('error', () => resolve(false))
      } catch { resolve(false) }
    })
    return reply.send({ ok: launched, alreadyRunning: false })
  })

  // GET /datadome-cookie/:domain — retrieve stored DataDome cookie for a domain
  app.get<{ Params: { domain: string } }>('/datadome-cookie/:domain', async (request, reply) => {
    const { dataDomeCookies } = await import('./internal.route.js')
    return reply.send({ cookie: dataDomeCookies[request.params.domain] ?? null })
  })

  // POST /resolve-ibe — admin tool: follow booking links on a hotel website and identify the IBE
  // Synchronous (admin waits); 35s timeout covers browser navigation.
  app.post<{ Body: { url: string } }>('/resolve-ibe', async (request, reply) => {
    const { url } = request.body;
    if (!url?.trim()) return reply.badRequest('url required');

    type ResolveResult = {
      found: boolean;
      ibeName: string | null;
      ibeUrl: string | null;
      fullySupported: boolean;
      needsHgReview: boolean;
      suggestedUrl?: string | null;
    };

    const timeout = new Promise<ResolveResult>((resolve) =>
      setTimeout(() => resolve({ found: false, ibeName: null, ibeUrl: null, fullySupported: false, needsHgReview: false, suggestedUrl: null }), 35000)
    );

    const resolution = resolveIbeUrl(url.trim()).then((resolved): ResolveResult => {
      if (!resolved) return { found: false, ibeName: null, ibeUrl: null, fullySupported: false, needsHgReview: false, suggestedUrl: null };
      const fullySupported = ibeHarvesterMap.has(resolved.ibeName);
      // Unknown IBE — found a URL but couldn't identify the system
      if (resolved.ibeName === 'Unknown IBE') {
        return { found: false, ibeName: null, ibeUrl: null, fullySupported: false, needsHgReview: false, suggestedUrl: resolved.ibeUrl };
      }
      return {
        found: true,
        ibeName: resolved.ibeName,
        ibeUrl: resolved.ibeUrl,
        fullySupported,
        needsHgReview: !fullySupported,
      };
    }).catch((): ResolveResult => ({ found: false, ibeName: null, ibeUrl: null, fullySupported: false, needsHgReview: false, suggestedUrl: null }));

    return reply.send(await Promise.race([resolution, timeout]));
  });

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
