/**
 * Resolves HyperGuest credentials by merging DB settings (priority) with env var fallbacks.
 * Cached in-memory for 60 seconds so changes propagate without a restart.
 *
 * For guest-facing routes (no organizationId), falls back to env vars.
 * For admin routes, pass the organizationId to get org-specific credentials.
 */

import { prisma } from '../db/client.js'
import { env } from '../config/env.js'

export interface HGCredentials {
  bearerToken: string
  staticDomain: string
  searchDomain: string
  bookingDomain: string
}

const orgCache = new Map<number | 'env', { value: HGCredentials; expiresAt: number }>()
const propCache = new Map<number, { value: HGCredentials; expiresAt: number }>()
const CACHE_TTL_MS = 60_000

export async function getHGCredentials(organizationId?: number): Promise<HGCredentials> {
  const key = organizationId ?? 'env'
  const cached = orgCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.value

  const settings = organizationId
    ? await prisma.orgSettings.findUnique({ where: { organizationId } })
    : null

  const value: HGCredentials = {
    bearerToken: settings?.hyperGuestBearerToken || env.HYPERGUEST_BEARER_TOKEN || '',
    staticDomain: settings?.hyperGuestStaticDomain || env.HYPERGUEST_STATIC_DOMAIN || '',
    searchDomain: settings?.hyperGuestSearchDomain || env.HYPERGUEST_SEARCH_DOMAIN || '',
    bookingDomain: settings?.hyperGuestBookingDomain || env.HYPERGUEST_BOOKING_DOMAIN || '',
  }
  orgCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

/** Resolves credentials for a specific property: property-level → org-level → env vars. */
export async function getHGCredentialsForProperty(propertyId: number): Promise<HGCredentials> {
  const cached = propCache.get(propertyId)
  if (cached && Date.now() < cached.expiresAt) return cached.value

  const prop = await prisma.property.findFirst({
    where: { propertyId, deletedAt: null },
    select: {
      organizationId: true,
      hyperGuestBearerToken: true,
      hyperGuestStaticDomain: true,
      hyperGuestSearchDomain: true,
      hyperGuestBookingDomain: true,
    },
  })

  const orgCreds = await getHGCredentials(prop?.organizationId)

  const value: HGCredentials = {
    bearerToken: prop?.hyperGuestBearerToken || orgCreds.bearerToken,
    staticDomain: prop?.hyperGuestStaticDomain || orgCreds.staticDomain,
    searchDomain: prop?.hyperGuestSearchDomain || orgCreds.searchDomain,
    bookingDomain: prop?.hyperGuestBookingDomain || orgCreds.bookingDomain,
  }
  propCache.set(propertyId, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

/**
 * Resolves credentials for a B2B buyer: buyer org token if configured,
 * otherwise falls back to the property's credentials (seller side).
 */
export async function getBuyerHGCredentials(buyerOrgId: number, propertyId: number): Promise<HGCredentials> {
  const buyerCreds = await getHGCredentials(buyerOrgId)
  if (buyerCreds.bearerToken) return buyerCreds
  return getHGCredentialsForProperty(propertyId)
}

export function invalidateCredentialsCache(organizationId?: number) {
  if (organizationId !== undefined) {
    orgCache.delete(organizationId)
  } else {
    orgCache.clear()
  }
  propCache.clear()
}
