import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'

const META_API_VERSION = 'v19.0'

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
): Promise<void> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    logger.error({ phoneNumberId, to, status: res.status, body }, '[WhatsApp] Send failed')
    throw new Error(`WhatsApp send failed: ${res.status}`)
  }
}

/**
 * Look up which org owns the given WhatsApp phone_number_id.
 * Returns { organizationId, phoneNumberId, accessToken } or null if not found / disabled.
 */
export async function resolveOrgByPhoneNumberId(phoneNumberId: string): Promise<{
  organizationId: number
  phoneNumberId: string
  accessToken: string
} | null> {
  const row = await prisma.communicationSettings.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId, whatsappEnabled: true },
    select: { organizationId: true, whatsappPhoneNumberId: true, whatsappAccessToken: true },
  })

  if (!row || !row.whatsappAccessToken) return null

  return {
    organizationId: row.organizationId,
    phoneNumberId: row.whatsappPhoneNumberId,
    accessToken: row.whatsappAccessToken,
  }
}

/**
 * Get any property ID belonging to an org (used to resolve AI config).
 */
export async function getOrgPropertyId(organizationId: number): Promise<number | undefined> {
  const prop = await prisma.property.findFirst({
    where: { organizationId, deletedAt: null },
    select: { propertyId: true },
  })
  return prop?.propertyId
}
