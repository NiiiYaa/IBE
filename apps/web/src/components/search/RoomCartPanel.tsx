'use client'

import type { RoomOption, RateOption } from '@ibe/shared'
import { formatCurrency } from '@ibe/shared'
import { useT } from '@/context/translations'

export interface CartItem {
  key: string  // unique per selection (roomId + ratePlanId + index)
  room: RoomOption
  rate: RateOption
}

interface RoomCartPanelProps {
  items: CartItem[]
  maxRooms: number
  nights: number
  locale: string
  displayCurrency: string
  convert: (amount: number) => number
  onRemove: (key: string) => void
  onBook: () => void
}

export function RoomCartPanel({
  items,
  maxRooms,
  nights,
  locale,
  displayCurrency,
  convert,
  onRemove,
  onBook,
}: RoomCartPanelProps) {
  const t = useT('search')
  const tRooms = useT('rooms')
  const total = items.reduce((sum, item) => sum + convert(item.rate.prices.sell.amount), 0)

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
      {/* Header */}
      <div className="bg-primary px-5 py-3 shrink-0">
        <p className="text-xs font-medium uppercase tracking-wider text-white/70">{t('yourSelection')}</p>
        <p className="text-base font-semibold text-white">
          {formatCurrency(total, displayCurrency, locale)} {tRooms('total')}
        </p>
        {nights > 0 && (
          <p className="text-xs text-white/60 mt-0.5">
            {nights} night{nights !== 1 ? 's' : ''} · {items.length}/{maxRooms} room{items.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-border)]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
            <svg className="mb-3 h-10 w-10 text-[var(--color-border)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7l9 6 9-6" />
            </svg>
            <p className="text-sm font-medium text-[var(--color-text)]">{tRooms('noRoomsAdded')}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{tRooms('selectRoomToAdd')}</p>
          </div>
        ) : (
          items.map((item, idx) => (
            <div key={item.key} className="flex items-start gap-3 px-4 py-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-xs font-bold text-[var(--color-primary)]">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text)]">{item.room.roomName}</p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{item.rate.ratePlanName}</p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--color-primary)]">
                  {formatCurrency(convert(item.rate.prices.sell.amount), displayCurrency, locale)}
                </p>
              </div>
              <button
                onClick={() => onRemove(item.key)}
                aria-label={t('removeRoom')}
                className="mt-0.5 shrink-0 rounded-full p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--color-border)] p-4 space-y-2">
        {items.length < maxRooms && (
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            You can add up to {maxRooms - items.length} more room{maxRooms - items.length !== 1 ? 's' : ''}
          </p>
        )}
        <button
          onClick={onBook}
          disabled={items.length === 0}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {items.length === 0 ? 'Add rooms to book' : `Book ${items.length} room${items.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
