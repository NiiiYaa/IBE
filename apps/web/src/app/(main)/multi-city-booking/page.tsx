import dynamic from 'next/dynamic'

const MultiCityBookingContent = dynamic(
  () => import('./_content').then(m => ({ default: m.MultiCityBookingContent })),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--color-border)]" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-[var(--color-border)]" />
            ))}
          </div>
        </div>
      </main>
    ),
  },
)

export default function MultiCityBookingPage() {
  return <MultiCityBookingContent />
}
