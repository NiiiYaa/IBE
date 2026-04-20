import { headers } from 'next/headers'
import type { PropertyListResponse } from '@ibe/shared'
import { RegisterForm } from './_form'

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'] || 0)
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

type TenantResolution =
  | { type: 'property'; propertyId: number; orgId: number }
  | { type: 'org'; orgId: number }

async function resolveTenantHost(host: string): Promise<TenantResolution | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/resolve?host=${encodeURIComponent(host)}`, { next: { revalidate: 60 } })
    return res.ok ? (res.json() as Promise<TenantResolution>) : null
  } catch { return null }
}

async function resolveChain(hyperGuestOrgId: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/org-resolve/${encodeURIComponent(hyperGuestOrgId)}`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const d = await res.json() as { id: number }
    return d.id ?? null
  } catch { return null }
}

async function resolveDefaultPropertyId(orgId: number): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?orgId=${orgId}`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const list = await res.json() as PropertyListResponse
    const defaultProp = list.properties.find(p => p.isDefault) ?? list.properties[0]
    return defaultProp?.propertyId ?? null
  } catch { return null }
}

async function resolvePropertyId(): Promise<number> {
  const reqHeaders = headers()
  const tenantHost  = reqHeaders.get('x-tenant-host')
  const tenantHotel = reqHeaders.get('x-tenant-hotel')
  const tenantChain = reqHeaders.get('x-tenant-chain')

  if (tenantHost) {
    const tenant = await resolveTenantHost(tenantHost)
    if (tenant?.type === 'property') return tenant.propertyId
    if (tenant?.type === 'org') {
      const pid = await resolveDefaultPropertyId(tenant.orgId)
      if (pid) return pid
    }
  }
  if (tenantHotel) {
    const pid = Number(tenantHotel)
    if (pid > 0) return pid
  }
  if (tenantChain) {
    const orgId = await resolveChain(tenantChain)
    if (orgId) {
      const pid = await resolveDefaultPropertyId(orgId)
      if (pid) return pid
    }
  }
  return DEFAULT_PROPERTY_ID
}

export default async function GuestRegisterPage() {
  const propertyId = await resolvePropertyId()
  return <RegisterForm propertyId={propertyId} />
}
