'use client'

import { useState, useRef, useEffect } from 'react'
import { COUNTRIES, countryFlag } from '@/lib/countries'

interface NationalityDropdownProps {
  value: string
  onChange: (code: string) => void
}

export function NationalityDropdown({ value, onChange }: NationalityDropdownProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = query.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.code.toLowerCase().includes(query.toLowerCase()),
      )
    : COUNTRIES

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
      {/* Search input */}
      <div className="border-b border-[var(--color-border)] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
          <svg className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search countries…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder-muted outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted hover:text-[var(--color-text)]">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Country list */}
      <ul className="max-h-60 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted">No countries found</li>
        ) : (
          filtered.map(country => (
            <li key={country.code}>
              <button
                onClick={() => onChange(country.code)}
                className={[
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                  country.code === value
                    ? 'bg-[var(--color-primary-light)] font-semibold text-primary'
                    : 'hover:bg-gray-50 text-[var(--color-text)]',
                ].join(' ')}
              >
                <span className="text-base leading-none">{countryFlag(country.code)}</span>
                <span className="flex-1">{country.name}</span>
                <span className="text-xs text-muted">{country.code}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
