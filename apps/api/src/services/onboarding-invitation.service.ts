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

export async function triggerBackgroundHarvest(invitationId: number, ibeUrl: string) {
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestStatus: 'harvesting' },
  })
  const internalUrl = process.env['ONBOARDING_API_INTERNAL_URL'] ?? 'http://localhost:3003'
  const res = await fetch(`${internalUrl}/internal/harvest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitationId, ibeUrl }),
  })
  if (!res.ok) throw new Error(`Internal harvest request failed: ${res.status}`)
}

export async function markHarvestComplete(invitationId: number, harvestedData: unknown) {
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestStatus: 'complete', harvestedData: harvestedData as any },
  })
  const invitation = await prisma.onboardingInvitation.findUnique({ where: { id: invitationId } })
  if (invitation?.contactEmail) {
    await sendInvitationEmail(invitation)
  }
}

export async function markHarvestFailed(invitationId: number, reason: string) {
  await prisma.onboardingInvitation.update({
    where: { id: invitationId },
    data: { harvestStatus: 'failed', failureReason: reason },
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
