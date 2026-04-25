/**
 * Groups page — server wrapper passes propertyId to the client component.
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

export default function GroupsPage({
  searchParams,
}: {
  searchParams: { hotelId?: string }
}) {
  const propertyId = searchParams.hotelId ? Number(searchParams.hotelId) || DEFAULT_PROPERTY_ID : DEFAULT_PROPERTY_ID
  return <GroupsContent propertyId={propertyId} />
}
