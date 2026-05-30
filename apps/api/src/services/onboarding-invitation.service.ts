import { randomUUID } from 'node:crypto'
import { prisma } from '../db/client.js'
import { sendInvitationEmail, notifyHarvestFailure } from './onboarding-email.service.js'

interface CreateInvitationInput {
  organizationId: number
  pmsId?: number
  pmsName?: string
  hotelName?: string
  websiteUrl?: string
  ibeUrl?: string
  ibePattern?: string
  contactEmail: string
  createdByAdminId?: number
  hgStatus?: string | null // null=ready | 'needs_setup' | 'needs_research'
}

export async function createInvitation(input: CreateInvitationInput) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const invitation = await prisma.onboardingInvitation.create({
    data: { ...input, expiresAt },
  })

  // Skip harvest for HG queue items — they're not ready for the hotel wizard yet
  if (invitation.ibeUrl && !invitation.hgStatus && invitation.source !== 'self_registration') {
    triggerBackgroundHarvest(invitation.id, invitation.ibeUrl).catch((err: unknown) => {
      console.error(`Background harvest trigger failed for invitation ${invitation.id}:`, err)
    })
  }

  return invitation
}

export async function triggerBackgroundHarvest(invitationId: number, _ibeUrl: string) {
  // Enqueue — the onboarding-api queue worker will pick this up based on priority
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: {
      harvestStatus: 'queued',
      harvestQueuedAt: new Date(),
      harvestStartedAt: null,
      harvestCompletedAt: null,
      failureReason: null,
      harvestLog: null,
      // harvestedData and harvestProgress are intentionally preserved for partial resume
    },
  })
}

export async function markHarvestComplete(invitationId: number, harvestedData: unknown) {
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestStatus: 'complete', harvestedData: harvestedData as any, harvestCompletedAt: new Date() },
  })
  const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
  if (invitation?.contactEmail) {
    await sendInvitationEmail(invitation)
  }
}

export async function markHarvestFailed(invitationId: number, reason: string) {
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestStatus: 'failed', failureReason: reason, harvestCompletedAt: new Date() },
  })
  await notifyHarvestFailure(invitationId, reason)
}

export async function listNeedsAttention() {
  return prisma.onboardingInvitation.findMany({
    where: { harvestStatus: 'failed' },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listInvitations(organizationId: number, includeDeleted = false) {
  const invitations = await prisma.onboardingInvitation.findMany({
    where: { organizationId, deletedAt: includeDeleted ? undefined : null },
    orderBy: { createdAt: 'desc' },
    include: { session: { select: { status: true, currentStep: true } } },
  })

  const adminIds = [...new Set(invitations.map(i => i.createdByAdminId).filter((id): id is number => id !== null))]
  const admins = adminIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, email: true } })
    : []
  const adminMap = Object.fromEntries(admins.map(a => [a.id, a]))

  return invitations.map(inv => ({
    ...inv,
    createdByAdmin: inv.createdByAdminId ? (adminMap[inv.createdByAdminId] ?? null) : null,
  }))
}

export async function revokeInvitation(id: number) {
  return prisma.onboardingInvitation.update({
    where: { id },
    data: { revokedAt: new Date() },
  })
}

export async function resendInvitation(id: number) {
  const invitation = await prisma.onboardingInvitation.update({
    where: { id },
    data: {
      token: randomUUID(),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
  await sendInvitationEmail(invitation)
  return invitation
}

export async function softDeleteInvitation(id: number) {
  return prisma.onboardingInvitation.update({
    where: { id },
    data: { deletedAt: new Date(), revokedAt: new Date() },
  })
}

export async function hardDeleteInvitation(id: number) {
  return prisma.onboardingInvitation.delete({ where: { id } })
}

const HARVEST_TIMEOUT_SECONDS = 600

export function startHarvestTimeoutWatcher() {
  const check = async () => {
    try {
      const cutoff = new Date(Date.now() - HARVEST_TIMEOUT_SECONDS * 1000)
      const stale = await prisma.onboardingInvitation.findMany({
        where: {
          harvestStatus: 'harvesting',
          harvestStartedAt: { lt: cutoff },
        },
        select: { id: true },
      })
      if (stale.length > 0) {
        await prisma.onboardingInvitation.updateMany({
          where: { id: { in: stale.map(i => i.id) } },
          data: {
            harvestStatus: 'failed',
            failureReason: `Harvest timed out after ${HARVEST_TIMEOUT_SECONDS}s`,
            harvestCompletedAt: new Date(),
          },
        })
        console.log(`[Harvest watcher] Marked ${stale.length} stale harvest(s) as failed`)
      }
    } catch { /* non-fatal */ }
  }

  // Run immediately on startup, then every 60s
  void check()
  return setInterval(check, 60_000)
}

export async function getInvitationByToken(token: string) {
  return prisma.onboardingInvitation.findUnique({ where: { token } })
}

export function isInvitationValid(inv: {
  revokedAt: Date | null
  usedAt: Date | null
  expiresAt: Date
}): { valid: boolean; reason?: string } {
  if (inv.revokedAt) return { valid: false, reason: 'revoked' }
  if (inv.usedAt) return { valid: false, reason: 'already_used' }
  if (inv.expiresAt < new Date()) return { valid: false, reason: 'expired' }
  return { valid: true }
}
