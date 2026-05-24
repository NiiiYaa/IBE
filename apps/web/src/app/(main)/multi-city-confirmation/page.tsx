import dynamic from 'next/dynamic'

const MultiCityConfirmationContent = dynamic(
  () => import('./_content').then(m => ({ default: m.MultiCityConfirmationContent })),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="space-y-4">
          <div className="h-10 w-80 animate-pulse rounded-lg bg-[var(--color-border)]" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-[var(--color-border)]" />
          ))}
        </div>
      </main>
    ),
  },
)

export default function MultiCityConfirmationPage() {
  return <MultiCityConfirmationContent />
}
