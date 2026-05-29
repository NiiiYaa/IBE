import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createInvitation,
  listInvitations,
  listNeedsAttention,
  revokeInvitation,
  triggerBackgroundHarvest,
} from '../services/onboarding-invitation.service.js'
import { getVendorFlow, listVendorFlows } from '@ibe/onboarding-flows'
import { detectKnownIBE, listKnownIBEPatterns } from '@ibe/shared'
import { resolveAIConfig } from '../services/ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import { prisma } from '../db/client.js'

const createInvitationSchema = z.object({
  pmsId:           z.number().int().positive().optional(),
  unknownPmsName:  z.string().optional(),
  hotelName:       z.string().optional(),
  city:            z.string().optional(),
  country:         z.string().optional(),
  websiteUrl:      z.string().url().optional(),
  ibeUrl:          z.string().url().optional(),
  ibePattern:      z.string().optional(),
  contactEmail:    z.string().email(),
  hgStatus:        z.enum(['needs_setup', 'needs_research']).nullable().optional(),
})

const setWhiteLabelSchema = z.object({
  whiteLabelOfPmsId: z.number().int().positive().nullable(),
})

export async function onboardingAdminRoutes(app: FastifyInstance) {
  app.post('/admin/hotel-onboarding/invitations', async (request, reply) => {
    const me = request.admin
    if (!me.organizationId) return reply.badRequest('No organization context')

    const parsed = createInvitationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send(parsed.error.issues)
    }
    const body = parsed.data

    let pmsId: number | undefined
    let pmsName: string | undefined
    if (body.pmsId) {
      const flow = getVendorFlow(body.pmsId)
      if (!flow) return reply.badRequest(`Unknown pmsId: ${body.pmsId}`)
      pmsId = body.pmsId
      pmsName = flow.pmsName
    }

    const inv = await createInvitation({
      organizationId: me.organizationId,
      ...(pmsId !== undefined && { pmsId }),
      ...(pmsName !== undefined && { pmsName }),
      ...(body.unknownPmsName !== undefined && { unknownPmsName: body.unknownPmsName }),
      ...(body.hotelName !== undefined && { hotelName: body.hotelName }),
      ...(body.city !== undefined && { city: body.city }),
      ...(body.country !== undefined && { country: body.country }),
      ...(body.websiteUrl !== undefined && { websiteUrl: body.websiteUrl }),
      ...(body.ibeUrl !== undefined && { ibeUrl: body.ibeUrl }),
      ...(body.ibePattern !== undefined && { ibePattern: body.ibePattern }),
      contactEmail: body.contactEmail,
      hgStatus: body.hgStatus ?? (body.unknownPmsName ? 'needs_setup' : null),
      createdByAdminId: me.adminId,
    })
    return reply.code(201).send(inv)
  })

  // GET /admin/hotel-onboarding/ari-sources/list — all registered vendor flows
  app.get('/admin/hotel-onboarding/ari-sources/list', async (_request, reply) => {
    const flows = listVendorFlows().map(f => ({
      pmsId: f.pmsId,
      pmsName: f.pmsName,
      dataFlow: f.dataFlow,
      useDefaultCodes: f.useDefaultCodes ?? false,
      regionAware: f.regionAware ?? false,
      requiresStaffChannelSetup: f.requiresStaffChannelSetup,
      stepCount: f.steps.length,
      kbVerified: f.kbVerified ?? false,
      preActions: f.preActions ?? [],
      steps: f.steps.map(s => ({ id: s.id, kind: s.kind, title: s.title, description: s.description })),
    }))
    return reply.send(flows)
  })

  // GET /admin/hotel-onboarding/ari-sources/white-labels — all WL mappings
  app.get('/admin/hotel-onboarding/ari-sources/white-labels', async (_request, reply) => {
    const mappings = await prisma.ariSourceWhiteLabel.findMany()
    const result: Record<string, number> = {}
    for (const m of mappings) result[String(m.pmsId)] = m.whiteLabelOfPmsId
    return reply.send(result)
  })

  // PUT /admin/hotel-onboarding/ari-sources/white-labels/:pmsId — set or clear WL
  app.put('/admin/hotel-onboarding/ari-sources/white-labels/:pmsId', async (request, reply) => {
    const me = request.admin
    if (me.role !== 'super') return reply.forbidden('Super admin required')
    const pmsId = parseInt((request.params as { pmsId: string }).pmsId)
    if (isNaN(pmsId)) return reply.badRequest('Invalid pmsId')
    const parsed = setWhiteLabelSchema.safeParse(request.body)
    if (!parsed.success) return reply.badRequest(parsed.error.issues.map(i => i.message).join(', '))
    const body = parsed.data
    if (body.whiteLabelOfPmsId === null) {
      await prisma.ariSourceWhiteLabel.deleteMany({ where: { pmsId } })
    } else {
      await prisma.ariSourceWhiteLabel.upsert({
        where:  { pmsId },
        update: { whiteLabelOfPmsId: body.whiteLabelOfPmsId },
        create: { pmsId, whiteLabelOfPmsId: body.whiteLabelOfPmsId },
      })
    }
    return reply.code(204).send()
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

  // GET /admin/hotel-onboarding/geocode — proxy to Nominatim (adds required User-Agent)
  app.get<{ Querystring: { name: string; city?: string; country?: string } }>(
    '/admin/hotel-onboarding/geocode',
    async (request, reply) => {
      const me = request.admin
      if (!me.organizationId && me.role !== 'super') return reply.forbidden()
      const { name, city, country } = request.query
      if (!name?.trim()) return reply.badRequest('name required')
      const q = encodeURIComponent([name, city, country].filter(Boolean).join(' '))
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=1&addressdetails=1`,
          {
            headers: { 'User-Agent': 'HyperGuestIBE/1.0 (nir@hyperguest.com)' },
            signal: AbortSignal.timeout(8000),
          }
        )
        if (!res.ok) return reply.send({ result: null })
        const data = await res.json() as Array<{
          display_name: string; lat: string; lon: string;
          address?: Record<string, string>
        }>
        if (!data.length) return reply.send({ result: null })
        const hit = data[0]!
        return reply.send({
          result: {
            address: hit.display_name,
            latitude: parseFloat(hit.lat),
            longitude: parseFloat(hit.lon),
            street: hit.address?.['road'] ?? hit.address?.['pedestrian'] ?? null,
            postalCode: hit.address?.['postcode'] ?? null,
          },
        })
      } catch {
        return reply.send({ result: null })
      }
    }
  )

  app.post<{ Body: { url: string } }>(
    '/admin/hotel-onboarding/resolve-ibe',
    async (request, reply) => {
      const me = request.admin
      if (!me.organizationId && me.role !== 'super') return reply.badRequest('No organization context')
      const { url } = request.body
      if (!url?.trim()) return reply.badRequest('url required')
      const internalUrl = process.env['ONBOARDING_API_INTERNAL_URL'] ?? 'http://localhost:3003'
      try {
        const res = await fetch(`${internalUrl}/resolve-ibe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
          signal: AbortSignal.timeout(38000),
        })
        if (!res.ok) return reply.send({ found: false, ibeName: null, ibeUrl: null, fullySupported: false, needsHgReview: false })
        return reply.send(await res.json())
      } catch {
        return reply.send({ found: false, ibeName: null, ibeUrl: null, fullySupported: false, needsHgReview: false })
      }
    }
  )

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
        type Candidate = { url: string; title: string; detected: boolean; ibeName: string | null; screenshotUrl: string | null; score: number }
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
              const aiHostname = (() => { try { return new URL(aiUrl).hostname.toLowerCase() } catch { return '' } })()
              const OTA_DOMAINS = [
                'booking.com', 'agoda.com', 'expedia.com', 'hotels.com', 'hotel.com',
                'tripadvisor.com', 'kayak.com', 'priceline.com', 'travelocity.com',
                'orbitz.com', 'hotwire.com', 'airbnb.com', 'vrbo.com', 'trip.com',
                'ctrip.com', 'skyscanner.com', 'skyscanner.net', 'lastminute.com',
              ]
              const aiIsOta = OTA_DOMAINS.some(ota => aiHostname === ota || aiHostname.endsWith('.' + ota))
              if (!aiIsOta && aiHostname) {
                const detection = detectKnownIBE(aiUrl)
                allCandidates.push({
                  url: aiUrl,
                  title: `${hotelName.trim()} (AI suggestion)`,
                  detected: detection !== null,
                  ibeName: detection?.name ?? null,
                  screenshotUrl: null,
                  score: detection ? 90 : 60,
                })
              }
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

  // PATCH /admin/hotel-onboarding/invitations/:id/ari-notes — save HG agent ARI investigation notes
  app.patch<{ Params: { id: string }; Body: { notes: string } }>(
    '/admin/hotel-onboarding/invitations/:id/ari-notes',
    async (request, reply) => {
      const me = request.admin
      const invitationId = parseInt(request.params.id, 10)
      const inv = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
      if (!inv) return reply.notFound()
      if (me.role !== 'super' && inv.organizationId !== me.organizationId) return reply.forbidden()
      await prisma.onboardingInvitation.update({
        where: { id: invitationId },
        data: { hgAriNotes: request.body.notes ?? '' },
      })
      return reply.code(204).send()
    }
  )

  // PATCH /admin/hotel-onboarding/invitations/:id/notes — save HG agent IBE investigation notes
  app.patch<{ Params: { id: string }; Body: { notes: string } }>(
    '/admin/hotel-onboarding/invitations/:id/notes',
    async (request, reply) => {
      const me = request.admin
      const invitationId = parseInt(request.params.id, 10)
      const inv = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
      if (!inv) return reply.notFound()
      if (me.role !== 'super' && inv.organizationId !== me.organizationId) return reply.forbidden()
      await prisma.onboardingInvitation.update({
        where: { id: invitationId },
        data: { hgNotes: request.body.notes ?? '' },
      })
      return reply.code(204).send()
    }
  )

  // POST /admin/hotel-onboarding/invitations/:id/notify-dev — send Slack alert to dev team
  app.post<{ Params: { id: string }; Body: { notes?: string; ibePrompt?: string; ariPrompt?: string } }>(
    '/admin/hotel-onboarding/invitations/:id/notify-dev',
    async (request, reply) => {
      const me = request.admin
      const invitationId = parseInt(request.params.id, 10)
      const inv = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
      if (!inv) return reply.notFound()
      if (me.role !== 'super' && inv.organizationId !== me.organizationId) return reply.forbidden()

      const notes = request.body.notes?.trim() ?? inv.hgNotes ?? ''
      const ibePrompt = request.body.ibePrompt?.trim()
      const ariPrompt = request.body.ariPrompt?.trim()

      // Persist notes if provided
      if (notes) {
        await prisma.onboardingInvitation.update({
          where: { id: invitationId },
          data: { hgNotes: notes },
        })
      }

      const webhookUrl = process.env['SLACK_DEV_WEBHOOK_URL']
      if (!webhookUrl) return reply.status(503).send({ error: 'SLACK_DEV_WEBHOOK_URL not configured' })

      const statusLabel = inv.hgStatus === 'needs_setup' ? '⚠️ IBE found — no harvester yet' : '🔍 No IBE found — needs investigation'
      const adminUrl = process.env['ADMIN_BASE_URL'] ?? 'http://localhost:3000'
      const ariLabel = inv.pmsName ?? inv.unknownPmsName ?? null

      const blocks = [
        { type: 'header', text: { type: 'plain_text', text: '🛠 New IBE/ARI to add to code' } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*Hotel*\n${inv.hotelName ?? '—'}` },
          { type: 'mrkdwn', text: `*Status*\n${statusLabel}` },
          { type: 'mrkdwn', text: `*Website*\n${inv.websiteUrl ? `${inv.websiteUrl}\n_(marketing site — booking engine is typically behind a "Book" or "Check Availability" button)_` : '—'}` },
          { type: 'mrkdwn', text: `*IBE URL*\n${inv.ibeUrl ?? '—'}` },
          { type: 'mrkdwn', text: `*IBE Pattern*\n${inv.ibePattern ?? 'Unknown'}` },
          { type: 'mrkdwn', text: `*ARI Source*\n${ariLabel ? `${ariLabel} _(no wizard flow yet)_` : '— (unknown)'}` },
        ]},
        ...(notes ? [{ type: 'section', text: { type: 'mrkdwn', text: `*IBE Notes*\n${notes}` } }] : []),
        ...(inv.hgAriNotes ? [{ type: 'section', text: { type: 'mrkdwn', text: `*ARI Notes*\n${inv.hgAriNotes}` } }] : []),
        ...(ibePrompt ? [{ type: 'section', text: { type: 'mrkdwn', text: `*⚡ IBE Prompt*\n\`\`\`${ibePrompt.slice(0, 2900)}\`\`\`` } }] : []),
        ...(ariPrompt ? [{ type: 'section', text: { type: 'mrkdwn', text: `*⚡ ARI Prompt*\n\`\`\`${ariPrompt.slice(0, 2900)}\`\`\`` } }] : []),
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'View in Admin ↗' },
            url: `${adminUrl}/admin/hotel-onboarding`, style: 'primary' },
        ]},
      ]

      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks }),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) throw new Error(`Slack returned ${res.status}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return reply.status(502).send({ error: `Slack notification failed: ${msg}` })
      }

      return reply.send({ ok: true })
    }
  )

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

  // ── Blocked domains ──────────────────────────────────────────────────────
  app.get('/admin/hotel-onboarding/blocked', async (request, reply) => {
    const me = request.admin
    if (me.role !== 'super' && !me.organizationId) return reply.forbidden()
    return prisma.onboardingBlockedDomain.findMany({ orderBy: { createdAt: 'desc' } })
  })

  app.post<{ Body: { url: string; label?: string; matchType?: string; country?: string } }>(
    '/admin/hotel-onboarding/blocked',
    async (request, reply) => {
      const me = request.admin
      if (me.role !== 'super' && !me.organizationId) return reply.forbidden()
      const raw = request.body.url?.trim()
      if (!raw) return reply.badRequest('url required')
      let domain = raw
      try {
        const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
        domain = u.hostname.toLowerCase().replace(/^www\./, '')
      } catch { domain = raw.toLowerCase().replace(/^www\./, '') }
      const existing = await prisma.onboardingBlockedDomain.findUnique({ where: { domain } })
      if (existing) return reply.conflict('Domain already blocked')
      const created = await prisma.onboardingBlockedDomain.create({
        data: {
          domain,
          label: request.body.label?.trim() || null,
          matchType: request.body.matchType ?? 'subdomain',
          country: request.body.country?.trim() || null,
          addedById: me.adminId,
        },
      })
      const internalUrl = process.env['ONBOARDING_API_INTERNAL_URL'] ?? 'http://localhost:3003'
      fetch(`${internalUrl}/internal/invalidate-blocked-cache`, { method: 'POST' }).catch(() => {})
      return reply.code(201).send(created)
    }
  )

  app.patch<{ Params: { id: string }; Body: { label?: string; matchType?: string; country?: string | null } }>(
    '/admin/hotel-onboarding/blocked/:id',
    async (request, reply) => {
      const me = request.admin
      if (me.role !== 'super' && !me.organizationId) return reply.forbidden()
      const id = parseInt(request.params.id, 10)
      const updated = await prisma.onboardingBlockedDomain.update({
        where: { id },
        data: {
          ...(request.body.label !== undefined && { label: request.body.label || null }),
          ...(request.body.matchType !== undefined && { matchType: request.body.matchType }),
          ...(request.body.country !== undefined && { country: request.body.country || null }),
        },
      })
      return reply.send(updated)
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/admin/hotel-onboarding/blocked/:id',
    async (request, reply) => {
      const me = request.admin
      if (me.role !== 'super' && !me.organizationId) return reply.forbidden()
      const id = parseInt(request.params.id, 10)
      await prisma.onboardingBlockedDomain.delete({ where: { id } }).catch(() => {})
      const internalUrl = process.env['ONBOARDING_API_INTERNAL_URL'] ?? 'http://localhost:3003'
      fetch(`${internalUrl}/internal/invalidate-blocked-cache`, { method: 'POST' }).catch(() => {})
      return reply.code(204).send()
    }
  )

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
