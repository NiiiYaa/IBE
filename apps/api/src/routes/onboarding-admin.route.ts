import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createInvitation,
  listInvitations,
  listNeedsAttention,
  revokeInvitation,
  triggerBackgroundHarvest,
} from '../services/onboarding-invitation.service.js'
import { getVendorFlow } from '@ibe/onboarding-flows'
import { detectKnownIBE, listKnownIBEPatterns } from '@ibe/shared'
import { resolveAIConfig } from '../services/ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { prisma } from '../db/client.js'

const createInvitationSchema = z.object({
  pmsId: z.number().int().positive(),
  hotelName: z.string().optional(),
  ibeUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
})

export async function onboardingAdminRoutes(app: FastifyInstance) {
  app.post('/admin/hotel-onboarding/invitations', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId) return reply.badRequest('No organization context')
    const body = createInvitationSchema.parse(request.body)
    const flow = getVendorFlow(body.pmsId)
    if (!flow) return reply.badRequest(`Unknown pmsId: ${body.pmsId}`)

    const inv = await createInvitation({
      organizationId: me.organizationId,
      pmsId: body.pmsId,
      pmsName: flow.pmsName,
      ...(body.hotelName !== undefined && { hotelName: body.hotelName }),
      ...(body.ibeUrl !== undefined && { ibeUrl: body.ibeUrl }),
      ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
      createdByAdminId: me.adminId,
    })
    return reply.code(201).send(inv)
  })

  app.get('/admin/hotel-onboarding/invitations', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId) return reply.badRequest('No organization context')
    return listInvitations(me.organizationId)
  })

  app.get('/admin/hotel-onboarding/stats', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId && me.role !== 'super') return reply.badRequest('No organization context')
    const orgFilter = me.role === 'super' ? {} : { organizationId: me.organizationId }

    const invitations = await prisma.onboardingInvitation.findMany({
      where: orgFilter,
      select: {
        pmsId: true,
        ibePattern: true,
        ibeUrl: true,
        session: { select: { status: true } },
      },
    })

    const ariStats: Record<number, { total: number; approved: number }> = {}
    const ibeStats: Record<string, { total: number; approved: number }> = {}
    const ibeSampleUrls: Record<string, string> = {}

    for (const inv of invitations) {
      if (inv.pmsId !== null) {
        if (!ariStats[inv.pmsId]) ariStats[inv.pmsId] = { total: 0, approved: 0 }
        ariStats[inv.pmsId]!.total++
        if (inv.session?.status === 'approved') ariStats[inv.pmsId]!.approved++
      }
      if (inv.ibePattern) {
        if (!ibeStats[inv.ibePattern]) ibeStats[inv.ibePattern] = { total: 0, approved: 0 }
        ibeStats[inv.ibePattern]!.total++
        if (inv.session?.status === 'approved') ibeStats[inv.ibePattern]!.approved++
        if (!ibeSampleUrls[inv.ibePattern] && inv.ibeUrl) {
          ibeSampleUrls[inv.ibePattern] = inv.ibeUrl
        }
      }
    }

    // Fallback: populate missing sample URLs from ExternalIBEConfig.searchSampleUrls
    const extConfigs = await prisma.externalIBEConfig.findMany({
      select: { searchSampleUrls: true },
    })
    for (const cfg of extConfigs) {
      const urls = cfg.searchSampleUrls as string[]
      for (const url of urls) {
        const detected = detectKnownIBE(url)
        if (detected?.name && !ibeSampleUrls[detected.name]) {
          ibeSampleUrls[detected.name] = url
        }
      }
    }

    // Final fallback: registry-level sampleUrl per pattern
    for (const pattern of listKnownIBEPatterns()) {
      if (pattern.sampleUrl && !ibeSampleUrls[pattern.name]) {
        ibeSampleUrls[pattern.name] = pattern.sampleUrl
      }
    }

    return reply.send({ ariStats, ibeStats, ibeSampleUrls })
  })

  app.post<{ Body: { url: string } }>('/admin/hotel-onboarding/screenshot', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId && me.role !== 'super') return reply.badRequest('No organization context')
    const { url } = request.body
    if (!url?.trim()) return reply.badRequest('url required')
    const internalUrl = process.env['ONBOARDING_API_INTERNAL_URL'] ?? 'http://localhost:3003'
    try {
      const res = await fetch(`${internalUrl}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) return reply.send({ screenshotUrl: null })
      const data = await res.json() as { screenshotUrl: string | null }
      // Rewrite path to go through main API so browser doesn't need direct access to onboarding-api
      const screenshotUrl = data.screenshotUrl
        ? `/api/v1/admin/hotel-onboarding/screenshots/${data.screenshotUrl.split('/').pop()}`
        : null
      return reply.send({ screenshotUrl })
    } catch {
      return reply.send({ screenshotUrl: null })
    }
  })

  app.get<{ Params: { file: string } }>('/admin/hotel-onboarding/screenshots/:file', async (request, reply) => {
    const internalUrl = process.env['ONBOARDING_API_INTERNAL_URL'] ?? 'http://localhost:3003'
    const { file } = request.params
    try {
      const res = await fetch(`${internalUrl}/screenshots/${encodeURIComponent(file)}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return reply.status(404).send()
      const buffer = await res.arrayBuffer()
      return reply.type('image/png').send(Buffer.from(buffer))
    } catch {
      return reply.status(404).send()
    }
  })

  app.post<{ Body: { hotelName: string; city: string; country?: string } }>(
    '/admin/hotel-onboarding/search',
    async (request, reply) => {
      try {
      const me = request.admin
      if (!me.organizationId && me.role !== 'super') return reply.badRequest('No organization context')
      const { hotelName, city, country } = request.body
      if (!hotelName?.trim()) return reply.badRequest('hotelName is required')
      const internalUrl = process.env['ONBOARDING_API_INTERNAL_URL'] ?? 'http://localhost:3003'
      try {
        type Candidate = { url: string; title: string; detected: boolean; screenshotUrl: string | null; score: number }
        const allCandidates: Candidate[] = []

        // Step 1: DataForSEO SERP (fast ~2s)
        try {
          const dfsRes = await fetch(`${internalUrl}/hotel-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotelName: hotelName.trim(), city: city?.trim() ?? '', country: country?.trim() ?? '' }),
            signal: AbortSignal.timeout(20000),
          })
          if (dfsRes.ok) {
            const dfsData = await dfsRes.json() as { candidates: Candidate[] }
            allCandidates.push(...dfsData.candidates)
          }
        } catch { /* DataForSEO failed — continue */ }

        if (allCandidates.some(c => c.score >= 30)) return reply.send({ candidates: allCandidates })

        // Step 2: AI fallback
        const aiConfig = await resolveAIConfig()
        if (aiConfig && aiConfig.provider !== 'fake') {
          try {
            const adapter = getProviderAdapter(aiConfig.provider)
            let aiTimeoutId: ReturnType<typeof setTimeout>
            const aiRes = await Promise.race([
              adapter.call(
                [{ role: 'user', content: `What is the official website homepage URL for the hotel or brand that operates "${hotelName.trim()}"${city?.trim() ? ` in ${city.trim()}` : ''}${country?.trim() ? `, ${country.trim()}` : ''}? Reply with ONLY the root homepage URL (e.g. https://www.example.com), no specific page paths, no explanation.` }],
                [],
                'You are a hotel industry expert. Reply with only a URL.',
                aiConfig.apiKey,
                aiConfig.model,
              ),
              new Promise<never>((_, reject) => { aiTimeoutId = setTimeout(() => reject(new Error('AI timeout')), 15000) }),
            ]).finally(() => clearTimeout(aiTimeoutId))
            const urlMatch = aiRes.text?.match(/https?:\/\/[^\s"'<>]+/)
            if (urlMatch) {
              const aiUrl = urlMatch[0].replace(/[.,)]+$/, '')
              const detection = detectKnownIBE(aiUrl)
              allCandidates.push({
                url: aiUrl,
                title: `${hotelName.trim()} (AI suggestion)`,
                detected: detection !== null,
                screenshotUrl: null,
                score: detection ? 90 : 60,
              })
            }
          } catch { /* AI failed — continue to Brave */ }
        }

        if (allCandidates.some(c => c.score >= 30)) return reply.send({ candidates: allCandidates })

        // Step 3: Brave (last resort, slow ~40s)
        const braveController = new AbortController()
        const braveTimeout = setTimeout(() => braveController.abort(), 45000)
        try {
          const braveRes = await fetch(`${internalUrl}/hotel-search/brave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotelName: hotelName.trim(), city: city?.trim() ?? '', country: country?.trim() ?? '' }),
            signal: braveController.signal,
          })
          if (braveRes.ok) {
            const braveData = await braveRes.json() as { candidates: Candidate[] }
            // Merge, deduplicating by hostname
            const seen = new Set(allCandidates.map(c => { try { return new URL(c.url).hostname } catch { return c.url } }))
            for (const c of braveData.candidates) {
              try {
                const h = new URL(c.url).hostname
                if (!seen.has(h)) { seen.add(h); allCandidates.push(c) }
              } catch { allCandidates.push(c) }
            }
          }
        } finally {
          clearTimeout(braveTimeout)
        }

        return reply.send({ candidates: allCandidates })
      } catch (innerErr) {
        return reply.status(502).send({ error: 'Search service unavailable' })
      }
      } catch (outerErr: unknown) {
        const msg = outerErr instanceof Error ? outerErr.message : String(outerErr)
        request.log.error({ err: outerErr }, '[Search] outer error: ' + msg)
        return reply.status(500).send({ error: msg })
      }
    }
  )

  app.get('/admin/hotel-onboarding/invitations/needs-attention', async (request, reply) => {
    const me = request.admin
    if (me.role !== 'super') return reply.forbidden('Super admin required')
    return listNeedsAttention()
  })

  app.delete('/admin/hotel-onboarding/invitations/:id', async (request, reply) => {
    const me = request.admin
    const { id } = request.params as { id: string }
    const invitationId = parseInt(id, 10)
    const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
    if (!invitation) return reply.notFound('Invitation not found')
    if (me.role !== 'super' && invitation.organizationId !== me.organizationId) {
      return reply.forbidden('Access denied')
    }
    await revokeInvitation(invitationId)
    return reply.code(204).send()
  })

  app.post('/admin/hotel-onboarding/invitations/:id/retry-harvest', async (request, reply) => {
    const me = request.admin
    const invitationId = parseInt((request.params as { id: string }).id, 10)
    const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
    if (!invitation) return reply.notFound('Invitation not found')
    if (me.role !== 'super' && invitation.organizationId !== me.organizationId) {
      return reply.forbidden('Access denied')
    }
    if (!invitation.ibeUrl) return reply.badRequest('No IBE URL on invitation')
    await triggerBackgroundHarvest(invitationId, invitation.ibeUrl)
    return { ok: true }
  })

  app.put('/admin/hotel-onboarding/sessions/:id/approve', async (request, reply) => {
    const me = request.admin
    const sessionId = parseInt((request.params as { id: string }).id, 10)
    const session = await prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      include: { invitation: { select: { organizationId: true } } },
    })
    if (!session) return reply.notFound('Session not found')
    if (me.role !== 'super' && session.invitation.organizationId !== me.organizationId) {
      return reply.forbidden('Access denied')
    }
    if (session.status !== 'pending_review') return reply.badRequest('Session is not pending review')
    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { status: 'approved', approvedAt: new Date(), approvedByAdminId: me.adminId },
    })
    return reply.send({ ok: true })
  })
}
