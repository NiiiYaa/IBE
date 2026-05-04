/**
 * Groups page — server wrapper passes propertyId + orgId to the client component.
 */
import dynamic from 'next/dynamic'

const GroupsContent = dynamic(
  () => import('./_content').then(m => ({ default: m.GroupsContent })),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--color-border)]" />
          <div className="h-64 animate-pulse rounded-xl bg-[var(--color-border)]" />
        </div>
      </main>
    ),
  },
)

const DEFAULT_PROPERTY_ID = Number(process.env['NEXT_PUBLIC_DEFAULT_HOTEL_ID'] || 0)
const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

async function fetchOrgId(propertyId: number): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/config/properties?propertyId=${propertyId}`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const data = await res.json() as { orgId?: number }
    return data.orgId ?? null
  } catch { return null }
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: { hotelId?: string; returnTo?: string }
}) {
  const propertyId = searchParams.hotelId ? Number(searchParams.hotelId) || DEFAULT_PROPERTY_ID : DEFAULT_PROPERTY_ID
  const orgId = await fetchOrgId(propertyId)
  return <GroupsContent propertyId={propertyId} {...(searchParams.returnTo != null ? { returnTo: searchParams.returnTo } : {})} {...(orgId != null ? { orgId } : {})} />
}
