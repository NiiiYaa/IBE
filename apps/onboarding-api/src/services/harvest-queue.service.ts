import { prisma } from '../db/client.js'
import { harvestFromUrl } from './ibe-harvester.service.js'
import { harvestMarketingSite, mergeMarketingData } from './marketing-site-harvester.js'

const HARVEST_TIMEOUT_MS = 600_000
const POLL_INTERVAL_MS = 5_000

// Priority: self_registration (3) > staff_invite (2) > zoho (1) > other (0)
const SOURCE_PRIORITY: Record<string, number> = {
  self_registration: 3,
  staff_invite: 2,
  zoho: 1,
}

async function processNextJob(): Promise<void> {
  // Skip if a harvest is already running
  const running = await prisma.onboardingInvitation.count({ where: { harvestStatus: 'harvesting' } })
  if (running > 0) return

  // Pick the highest-priority queued job (priority by source, then FIFO by queuedAt)
  const queued = await prisma.onboardingInvitation.findMany({
    where: { harvestStatus: 'queued', ibeUrl: { not: null } },
    select: { id: true, ibeUrl: true, websiteUrl: true, source: true, harvestQueuedAt: true, harvestedData: true, harvestProgress: true },
  })
  if (queued.length === 0) return

  queued.sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source] ?? 0
    const pb = SOURCE_PRIORITY[b.source] ?? 0
    if (pa !== pb) return pb - pa
    return (a.harvestQueuedAt?.getTime() ?? 0) - (b.harvestQueuedAt?.getTime() ?? 0)
  })

  const job = queued[0]!
  const callbackBase = process.env['IBE_API_CALLBACK_URL'] ?? 'http://localhost:3001'
  const secret = process.env['INTERNAL_API_SECRET'] ?? 'dev-internal-secret'

  await prisma.onboardingInvitation.update({
    where: { id: job.id },
    data: { harvestStatus: 'harvesting', harvestStartedAt: new Date() },
  })

  console.log(`[HarvestQueue] Starting job ${job.id} (source=${job.source}, priority=${SOURCE_PRIORITY[job.source] ?? 0})`)

  const existingData = job.harvestedData as Record<string, unknown> | null
  const completedSteps = Array.isArray(job.harvestProgress) ? job.harvestProgress as string[] : []

  const appendLog = (msg: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}\n`
    console.log(`[harvest:${job.id}] ${msg}`)
    prisma.$executeRaw`UPDATE "OnboardingInvitation" SET "harvestLog" = COALESCE("harvestLog", '') || ${line} WHERE id = ${job.id}`.catch(() => {})
  }

  const saveProgress = (stepKey: string, partialData?: Record<string, unknown>) => {
    const newSteps = [...completedSteps, stepKey]
    prisma.onboardingInvitation.update({
      where: { id: job.id },
      data: {
        harvestProgress: newSteps,
        ...(partialData ? { harvestedData: partialData as any } : {}),
      },
    }).catch(() => {})
  }

  // Callback for harvester to report a better IBE URL (e.g. D-Edge with hotelId)
  let resolvedIbeUrlFromHarvest: string | null = null
  const reportIbeUrl = (url: string) => { resolvedIbeUrlFromHarvest = url }

  const harvestPromise = harvestFromUrl(job.ibeUrl!, appendLog, { existingData, completedSteps, saveProgress, reportIbeUrl })
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Harvest timed out after ${HARVEST_TIMEOUT_MS / 1000}s`)), HARVEST_TIMEOUT_MS)
  )

  try {
    let harvestedData = await Promise.race([harvestPromise, timeoutPromise]) as Record<string, unknown>

    // If harvester discovered a better IBE URL (e.g. D-Edge with hotelId), update the invitation
    if (resolvedIbeUrlFromHarvest) {
      await prisma.onboardingInvitation.update({
        where: { id: job.id },
        data: { ibeUrl: resolvedIbeUrlFromHarvest },
      }).catch(() => {})
      appendLog(`  → IBE URL updated: ${resolvedIbeUrlFromHarvest.slice(0, 80)}`)
    }

    // Marketing site harvest — fills hotel-level gaps (address, phone, email, images, description)
    if (job.websiteUrl) {
      try {
        appendLog('Scraping marketing website for hotel-level data...')
        const marketing = await harvestMarketingSite(job.websiteUrl, appendLog)
        harvestedData = mergeMarketingData(harvestedData as Record<string, unknown>, marketing) as typeof harvestedData
        // Persist lat/lon to invitation record so the wizard can use them
        if (marketing.latitude && marketing.longitude) {
          await prisma.onboardingInvitation.update({
            where: { id: job.id },
            data: { latitude: marketing.latitude, longitude: marketing.longitude, address: marketing.address ?? undefined },
          }).catch(() => {})
        }
      } catch { /* non-fatal — proceed with IBE data only */ }
    }

    // Check if harvest was cancelled while running — if so, don't overwrite the failed status
    const current = await prisma.onboardingInvitation.findUnique({ where: { id: job.id }, select: { harvestStatus: true } })
    if (current?.harvestStatus === 'failed') {
      console.log(`[HarvestQueue] Job ${job.id} was cancelled — skipping complete callback`)
      return
    }
    await fetch(`${callbackBase}/internal/onboarding/harvest-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ invitationId: job.id, harvestedData }),
    }).catch(() => {})
    console.log(`[HarvestQueue] Job ${job.id} complete`)
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : 'Unknown harvest error'
    await fetch(`${callbackBase}/internal/onboarding/harvest-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ invitationId: job.id, reason }),
    }).catch(() => {})
    console.log(`[HarvestQueue] Job ${job.id} failed: ${reason}`)
  }
}

export function startHarvestQueue(): ReturnType<typeof setInterval> {
  console.log('[HarvestQueue] Started — polling every 5s, priority: self_registration > staff_invite > zoho')
  void processNextJob()
  return setInterval(() => void processNextJob(), POLL_INTERVAL_MS)
}
