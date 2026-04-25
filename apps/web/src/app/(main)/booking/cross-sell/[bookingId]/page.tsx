'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { CrossSellProduct, PublicCrossellResponse } from '@ibe/shared'

const PROPERTY_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_HOTEL_ID || 0)

function fmtCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
}

function calcItemTotal(product: CrossSellProduct, nights: number): number {
  const gross = product.price * (1 + product.tax / 100)
  return product.pricingModel === 'per_night' ? gross * nights : gross
}

// Reuses the same visual style as EventsStrip cards but larger and with a ticket link
function EventCard({ event }: { event: { name: string; date: string | null; time: string | null; category: string | null; genre: string | null; venue: string | null; ticketUrl: string | null; thumb: string | null } }) {
  const categoryColors: Record<string, string> = {
    music: 'bg-purple-100 text-purple-700',
    sports: 'bg-green-100 text-green-700',
    arts: 'bg-pink-100 text-pink-700',
    theatre: 'bg-pink-100 text-pink-700',
  }
  const colorCls = categoryColors[(event.category ?? '').toLowerCase()] ?? 'bg-[var(--color-background)] text-[var(--color-text-muted)]'

  const dateStr = event.date ? new Date(event.date + (event.time ? `T${event.time}` : '')).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }) : null

  return (
    <a
      href={event.ticketUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden hover:border-[var(--color-primary)] hover:shadow-md transition-all"
    >
      {event.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.thumb} alt={event.name} className="h-28 w-full object-cover" />
      ) : (
        <div className={['h-10 flex items-center justify-center gap-1.5 px-3', colorCls].join(' ')}>
          <span className="text-xs font-semibold uppercase tracking-wide">{event.category ?? 'Event'}</span>
        </div>
      )}
      <div className="px-3 py-2.5 flex flex-col gap-1 flex-1">
        <p className="text-sm font-semibold text-[var(--color-text)] line-clamp-2 leading-snug">{event.name}</p>
        {event.genre && event.genre !== 'Undefined' && (
          <p className="text-xs text-[var(--color-text-muted)]">{event.genre}</p>
        )}
        {dateStr && <p className="text-xs font-medium text-[var(--color-primary)]">{dateStr}</p>}
        {event.venue && <p className="text-xs text-[var(--color-text-muted)] truncate">{event.venue}</p>}
        {event.ticketUrl && (
          <span className="mt-auto pt-1.5 text-xs font-semibold text-[var(--color-primary)]">Get tickets →</span>
        )}
      </div>
    </a>
  )
}

interface PageProps {
  params: { bookingId: string }
}

export default function CrossSellPage({ params }: PageProps) {
  const router = useRouter()
  const [nights, setNights] = useState(1)
  const [propertyId, setPropertyId] = useState(PROPERTY_ID)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`ibe_confirm_${params.bookingId}`)
      if (raw) {
        const conf = JSON.parse(raw) as { checkIn?: string; checkOut?: string; propertyId?: number }
        if (conf.checkIn && conf.checkOut) {
          const n = Math.round((new Date(conf.checkOut).getTime() - new Date(conf.checkIn).getTime()) / 86400000)
          if (n > 0) setNights(n)
        }
        if (conf.propertyId) setPropertyId(conf.propertyId)
      }
    } catch {}
  }, [params.bookingId])

  const { data, isLoading } = useQuery<PublicCrossellResponse>({
    queryKey: ['cross-sell', propertyId],
    queryFn: () => apiClient.getPublicCrossSell(propertyId),
    enabled: propertyId > 0,
  })

  // Fetch events from public events endpoint for external products
  const { data: eventsData } = useQuery<{ enabled: boolean; events?: Array<{ name: string; date: string | null; time: string | null; category: string | null; genre: string | null; venue: string | null; ticketUrl: string | null; thumb: string | null }> }>({
    queryKey: ['events-public', propertyId],
    queryFn: () => fetch(`/api/v1/events?propertyId=${propertyId}`).then(r => r.ok ? r.json() : { enabled: false }),
    enabled: propertyId > 0,
  })

  const toggle = (id: number) => setSelected(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const activeProducts = data?.products ?? []
  const externalEvents = (data?.showExternalEvents && eventsData?.enabled) ? (eventsData.events ?? []) : []

  const total = activeProducts
    .filter(p => selected.has(p.id))
    .reduce((sum, p) => sum + calcItemTotal(p, nights), 0)

  const currency = activeProducts.find(p => selected.has(p.id))?.currency ?? 'USD'

  const hasContent = activeProducts.length > 0 || externalEvents.length > 0

  if (!data?.enabled && !isLoading) {
    router.replace(`/booking/confirmation/${params.bookingId}`)
    return null
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
          <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Enhance Your Stay</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Add extras to your booking #{params.bookingId}
        </p>
      </div>

      {isLoading && <p className="text-center text-sm text-[var(--color-text-muted)]">Loading offers…</p>}

      {!isLoading && !hasContent && (
        <p className="text-center text-sm text-[var(--color-text-muted)]">No extras available at this time.</p>
      )}

      {/* Internal products */}
      {activeProducts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Add to your stay</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeProducts.map(product => {
              const isSelected = selected.has(product.id)
              const itemTotal = calcItemTotal(product, nights)
              const priceLabel = product.pricingModel === 'per_night'
                ? `${fmtCurrency(product.price, product.currency)} × ${nights} night${nights !== 1 ? 's' : ''} = ${fmtCurrency(itemTotal, product.currency)}`
                : fmtCurrency(itemTotal, product.currency)

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggle(product.id)}
                  className={['text-left rounded-xl border-2 bg-[var(--color-surface)] overflow-hidden transition-all',
                    isSelected
                      ? 'border-[var(--color-primary)] shadow-md'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50',
                  ].join(' ')}
                >
                  {product.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={product.name} className="h-32 w-full object-cover" />
                  )}
                  <div className="p-3.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--color-text)]">{product.name}</p>
                      <div className={['flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        isSelected
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                          : 'border-[var(--color-border)]',
                      ].join(' ')}>
                        {isSelected && (
                          <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    {product.description && (
                      <p className="text-xs text-[var(--color-text-muted)]">{product.description}</p>
                    )}
                    <p className="text-xs font-medium text-[var(--color-primary)]">{priceLabel}</p>
                    {product.tax > 0 && (
                      <p className="text-[10px] text-[var(--color-text-muted)]">Includes {product.tax}% tax</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Running total + CTA */}
          {selected.size > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">Selected extras total</p>
                <p className="text-lg font-semibold text-[var(--color-text)]">{fmtCurrency(total, currency)}</p>
                {data?.paymentMode === 'informational' && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Payable at the hotel on arrival</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => router.push(`/booking/confirmation/${params.bookingId}`)}
                className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
              >
                Add to my stay →
              </button>
            </div>
          )}
        </section>
      )}

      {/* External events */}
      {externalEvents.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Events near the hotel</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {externalEvents.slice(0, 6).map((event, i) => (
              <EventCard key={i} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Skip */}
      <div className="text-center">
        <Link
          href={`/booking/confirmation/${params.bookingId}`}
          className="text-sm text-[var(--color-text-muted)] underline underline-offset-2 hover:text-[var(--color-text)]"
        >
          No thanks, skip to confirmation →
        </Link>
      </div>
    </main>
  )
}
