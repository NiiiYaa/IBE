'use client'

export interface GuestRoom {
  adults: number
  children: number
  infants: number
}

interface GuestsDropdownProps {
  rooms: GuestRoom[]
  onChange: (rooms: GuestRoom[]) => void
  infantMaxAge?: number
  childMaxAge?: number
  minRooms?: number
  maxRooms?: number
}

const MAX_CHILDREN_PER_ROOM = 6

export function GuestsDropdown({
  rooms,
  onChange,
  infantMaxAge = 2,
  childMaxAge = 16,
  minRooms = 1,
  maxRooms = 4,
}: GuestsDropdownProps) {
  function update(index: number, field: keyof GuestRoom, delta: number) {
    onChange(
      rooms.map((r, i) => {
        if (i !== index) return r
        const next = { ...r, [field]: r[field] + delta }
        // Clamp
        next.adults = Math.min(9, Math.max(1, next.adults))
        next.children = Math.min(MAX_CHILDREN_PER_ROOM, Math.max(0, next.children))
        next.infants = Math.min(MAX_CHILDREN_PER_ROOM, Math.max(0, next.infants))
        // Total non-adults cap
        if (next.children + next.infants > MAX_CHILDREN_PER_ROOM) {
          if (field === 'children') next.infants = MAX_CHILDREN_PER_ROOM - next.children
          else next.children = MAX_CHILDREN_PER_ROOM - next.infants
        }
        return next
      }),
    )
  }

  function addRoom() {
    if (rooms.length < maxRooms) onChange([...rooms, { adults: 2, children: 0, infants: 0 }])
  }

  function removeRoom(index: number) {
    if (rooms.length > minRooms) onChange(rooms.filter((_, i) => i !== index))
  }

  return (
    <div className="w-80 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
        <p className="text-sm font-semibold text-[var(--color-text)]">Guests</p>
        {rooms.length < maxRooms && (
          <button
            onClick={addRoom}
            className="text-xs font-medium text-[var(--color-primary)] hover:underline"
          >
            + Add room
          </button>
        )}
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {rooms.map((room, i) => (
          <div key={i} className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Room {i + 1}
              </p>
              {rooms.length > minRooms && (
                <button
                  onClick={() => removeRoom(i)}
                  className="text-xs text-muted transition-colors hover:text-error"
                >
                  Remove
                </button>
              )}
            </div>

            <GuestRow
              label="Adults"
              hint={`Age ${childMaxAge + 1}+`}
              value={room.adults}
              min={1}
              max={9}
              onDecrement={() => update(i, 'adults', -1)}
              onIncrement={() => update(i, 'adults', 1)}
            />
            <GuestRow
              label="Children"
              hint={`Age ${infantMaxAge + 1}–${childMaxAge}`}
              value={room.children}
              min={0}
              max={MAX_CHILDREN_PER_ROOM}
              onDecrement={() => update(i, 'children', -1)}
              onIncrement={() => update(i, 'children', 1)}
            />
            <GuestRow
              label="Infants"
              hint={`Age 0–${infantMaxAge}`}
              value={room.infants}
              min={0}
              max={MAX_CHILDREN_PER_ROOM}
              onDecrement={() => update(i, 'infants', -1)}
              onIncrement={() => update(i, 'infants', 1)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── GuestRow ──────────────────────────────────────────────────────────────────

function GuestRow({
  label,
  hint,
  value,
  min,
  max,
  onDecrement,
  onIncrement,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  onDecrement: () => void
  onIncrement: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onDecrement}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-sm text-muted transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <span className="w-5 text-center text-sm font-semibold text-[var(--color-text)]">
          {value}
        </span>
        <button
          onClick={onIncrement}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-sm text-muted transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  )
}
