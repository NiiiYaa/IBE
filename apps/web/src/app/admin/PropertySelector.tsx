'use client'

import { useState, useRef, useEffect } from 'react'
import type { PropertyRecord } from '@ibe/shared'

const SEARCH_THRESHOLD = 10

interface Selection {
  propertyId: number | null
  orgId: number | null
}

interface Props {
  properties: PropertyRecord[]
  isSuper: boolean
  selected: Selection
  onSelect: (s: Selection) => void
  propertyNameMap: Record<number, string>
}

export function PropertySelector({ properties, isSuper, selected, onSelect, propertyNameMap }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', onMouseDown)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const showSearch = properties.length > SEARCH_THRESHOLD
  const query = search.toLowerCase()

  function getDisplayLabel(): string {
    if (selected.propertyId === null) {
      if (isSuper && selected.orgId === null) return '⚙ System'
      if (isSuper && selected.orgId !== null) {
        const prop = properties.find(p => p.orgId === selected.orgId)
        const orgName = prop?.orgName ?? `Org ${selected.orgId}`
        const hgId = prop?.hyperGuestOrgId
        return `⛓ ${orgName}${hgId ? ` (${hgId})` : ''} — chain`
      }
      return '⛓ Chain (all properties)'
    }
    const name = propertyNameMap[selected.propertyId] ?? properties.find(p => p.propertyId === selected.propertyId)?.name ?? `Property ${selected.propertyId}`
    return `${name} (${selected.propertyId})`
  }

  function nameOf(p: PropertyRecord): string {
    return propertyNameMap[p.propertyId] ?? p.name ?? `Property ${p.propertyId}`
  }

  function matchesQuery(p: PropertyRecord): boolean {
    if (!query) return true
    return (
      nameOf(p).toLowerCase().includes(query) ||
      String(p.propertyId).includes(query) ||
      (p.orgName?.toLowerCase().includes(query) ?? false) ||
      (p.hyperGuestOrgId?.toLowerCase().includes(query) ?? false)
    )
  }

  // Build groups for rendering
  type Group = { name: string; orgId: number | null; hgOrgId: string | null; isDemo: boolean; props: PropertyRecord[] }
  const groups: Group[] = []

  if (isSuper) {
    const map = new Map<string, Group>()
    for (const p of properties) {
      const key = p.isDemo ? '__demo__' : (p.orgName ?? 'Unknown')
      if (!map.has(key)) {
        map.set(key, {
          name: p.isDemo ? 'Demo' : (p.orgName ?? 'Unknown'),
          orgId: p.isDemo ? null : (p.orgId ?? null),
          hgOrgId: p.isDemo ? null : (p.hyperGuestOrgId ?? null),
          isDemo: p.isDemo ?? false,
          props: [],
        })
      }
      map.get(key)!.props.push(p)
    }
    for (const g of map.values()) {
      const filtered = g.props.filter(matchesQuery)
      if (filtered.length > 0) groups.push({ ...g, props: filtered })
    }
  } else {
    groups.push({ name: '', orgId: null, hgOrgId: null, isDemo: false, props: properties.filter(matchesQuery) })
  }

  function select(propertyId: number | null, orgId: number | null) {
    onSelect({ propertyId, orgId })
    setOpen(false)
    setSearch('')
  }

  const optionBase = 'w-full text-left text-xs transition-colors hover:bg-[var(--color-background)]'
  const selectedCls = 'font-semibold text-[var(--color-primary)]'
  const normalCls = 'text-[var(--color-text)]'

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-left text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-light)]"
      >
        <span className="truncate">{getDisplayLabel()}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown — wider than the trigger */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 flex w-72 max-h-80 flex-col overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {showSearch && (
            <div className="shrink-0 border-b border-[var(--color-border)] p-1.5">
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search properties…"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-light)]"
              />
            </div>
          )}

          <div className="overflow-y-auto">
            {/* System option — super admin only */}
            {isSuper && (
              <button
                onClick={() => select(null, null)}
                className={`${optionBase} px-3 py-1.5 ${selected.propertyId === null && selected.orgId === null ? selectedCls : normalCls}`}
              >
                ⚙ System
              </button>
            )}
            {/* Global chain option — non-super users only */}
            {!isSuper && (
              <button
                onClick={() => select(null, null)}
                className={`${optionBase} px-3 py-1.5 ${selected.propertyId === null ? selectedCls : normalCls}`}
              >
                ⛓ Chain (all properties)
              </button>
            )}

            {groups.map((group, gi) => (
              <div key={gi}>
                {isSuper && (
                  group.isDemo ? (
                    <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                      Demo
                    </div>
                  ) : (
                    <button
                      onClick={() => group.orgId !== null && select(null, group.orgId)}
                      disabled={group.orgId === null}
                      className={[
                        'flex w-full items-center gap-1.5 px-3 py-1 text-left transition-colors',
                        group.orgId !== null ? 'cursor-pointer hover:bg-[var(--color-background)]' : 'cursor-default',
                        selected.propertyId === null && selected.orgId === group.orgId
                          ? 'text-[var(--color-primary)]'
                          : 'text-[var(--color-text-muted)]',
                      ].join(' ')}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-widest">{group.name}</span>
                      {group.orgId !== null && (
                        <span className="text-[9px] opacity-60">
                          {group.hgOrgId ? `(${group.hgOrgId})` : ''} ⛓ chain
                        </span>
                      )}
                    </button>
                  )
                )}

                {group.props.map(p => {
                  const label = p.isDemo
                    ? `Demo Hotel (${p.propertyId})`
                    : `${nameOf(p)} (${p.propertyId})`
                  const isSelected = selected.propertyId === p.propertyId
                  return (
                    <button
                      key={p.propertyId}
                      onClick={() => select(p.propertyId, p.orgId ?? null)}
                      className={`${optionBase} px-3 py-1.5 ${isSuper ? 'pl-6' : ''} ${isSelected ? selectedCls : normalCls}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            ))}

            {groups.length === 0 && (
              <p className="px-3 py-3 text-xs text-[var(--color-text-muted)]">No properties found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
