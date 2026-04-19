'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NavItem, OrgNavItem, NavItemSection, NavItemType, CreateNavItemRequest } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'

const TYPE_LABELS: Record<NavItemType, string> = {
  static: 'Static text',
  link: 'Link',
  popup: 'Popup',
}

interface NavItemEditorProps {
  section: NavItemSection
  title: string
  propertyId: number
}

export function NavItemEditor({ section, title, propertyId }: NavItemEditorProps) {
  const qc = useQueryClient()
  const qKey = ['nav-items', section, propertyId]

  const { data: items = [], isLoading } = useQuery<NavItem[]>({
    queryKey: qKey,
    queryFn: () => apiClient.getNavItems(propertyId, section),
    enabled: propertyId > 0,
  })

  const { data: orgItems = [] } = useQuery<OrgNavItem[]>({
    queryKey: ['org-nav-items', section],
    queryFn: () => apiClient.getOrgNavItems(section),
  })

  const overrideQKey = ['org-nav-item-overrides', propertyId]
  const { data: overrides = {} } = useQuery<Record<string, boolean>>({
    queryKey: overrideQKey,
    queryFn: () => apiClient.getOrgNavItemOverrides(propertyId),
  })

  const { mutate: toggleOverride } = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      apiClient.setOrgNavItemOverride(id, propertyId, isEnabled),
    onMutate: ({ id, isEnabled }) => {
      const prev = qc.getQueryData<Record<string, boolean>>(overrideQKey)
      qc.setQueryData<Record<string, boolean>>(overrideQKey, old => ({ ...old, [id]: isEnabled }))
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(overrideQKey, ctx.prev)
    },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: qKey })

  const createMut = useMutation({
    mutationFn: (data: CreateNavItemRequest) => apiClient.createNavItem(propertyId, data),
    onSuccess: invalidate,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<NavItem>) =>
      apiClient.updateNavItem(id, data),
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteNavItem(id),
    onSuccess: invalidate,
  })

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => apiClient.reorderNavItems(ids),
    onSuccess: invalidate,
  })

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function moveUp(idx: number) {
    if (idx === 0) return
    const ids = items.map(i => i.id)
    ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
    reorderMut.mutate(ids)
  }

  function moveDown(idx: number) {
    if (idx === items.length - 1) return
    const ids = items.map(i => i.id)
    ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
    reorderMut.mutate(ids)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add item
          </button>
        )}
      </div>

      {/* ── Inherited global items (read-only) ─────────────────────────────── */}
      {orgItems.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Inherited from global
          </p>
          <div className="space-y-1.5">
            {orgItems.map(item => {
              const enabled = overrides[item.id] ?? true
              return (
                <div
                  key={item.id}
                  className={['flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/60 px-4 py-2.5 transition-opacity', !enabled ? 'opacity-40' : 'opacity-80'].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--color-text)]">{item.label}</span>
                    <span className="ml-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                      {TYPE_LABELS[item.type]}
                    </span>
                    {item.type === 'link' && item.url && (
                      <span className="ml-2 truncate text-xs text-[var(--color-text-muted)]">{item.url}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-full bg-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      Global
                    </span>
                    <button
                      onClick={() => toggleOverride({ id: item.id, isEnabled: !enabled })}
                      className={[
                        'text-xs underline-offset-2 hover:underline',
                        enabled ? 'text-[var(--color-text-muted)] hover:text-[var(--color-error)]' : 'text-[var(--color-success)] hover:text-[var(--color-success)]',
                      ].join(' ')}
                    >
                      {enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {items.length > 0 && (
            <div className="mt-4 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Property-specific
              </p>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex h-20 items-center justify-center text-sm text-[var(--color-text-muted)]">
          Loading…
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, idx) =>
          editingId === item.id ? (
            <NavItemForm
              key={item.id}
              section={section}
              initial={item}
              onSave={data => {
                updateMut.mutate({ id: item.id, ...data })
                setEditingId(null)
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3"
            >
              {/* Reorder arrows */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-20"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === items.length - 1}
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-20"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[var(--color-text)]">{item.label}</span>
                <span className="ml-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                  {TYPE_LABELS[item.type]}
                </span>
                {item.type === 'link' && item.url && (
                  <span className="ml-2 truncate text-xs text-[var(--color-text-muted)]">{item.url}</span>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditingId(item.id)}
                  className="text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline hover:text-[var(--color-primary)]"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteMut.mutate(item.id)}
                  className="text-xs text-[var(--color-error)] underline-offset-2 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {adding && (
        <div className="mt-2">
          <NavItemForm
            section={section}
            onSave={data => {
              createMut.mutate({ ...data, section })
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {!isLoading && items.length === 0 && !adding && (
        <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
          No property-specific items yet. Add one above to supplement the global items.
        </p>
      )}
    </div>
  )
}

// ── Inline form ───────────────────────────────────────────────────────────────

interface NavItemFormProps {
  section: NavItemSection
  initial?: Partial<NavItem>
  onSave: (data: Omit<CreateNavItemRequest, 'section'>) => void
  onCancel: () => void
}

function NavItemForm({ initial, onSave, onCancel }: NavItemFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [type, setType] = useState<NavItemType>(initial?.type ?? 'link')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [content, setContent] = useState(initial?.content ?? '')

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    onSave({
      label: label.trim(),
      type,
      url: type === 'link' ? url : null,
      content: type === 'popup' ? content : null,
    })
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border-2 border-[var(--color-primary-light)] bg-[var(--color-surface)] p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Label</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Privacy Policy"
            className={inputCls}
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as NavItemType)}
            className={inputCls}
          >
            <option value="static">Static text</option>
            <option value="link">Link / URL</option>
            <option value="popup">Popup with text</option>
          </select>
        </div>
      </div>

      {type === 'link' && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">URL</label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className={inputCls}
          />
        </div>
      )}

      {type === 'popup' && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Popup content</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Enter the text to show in the popup…"
            rows={5}
            className={inputCls}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  )
}
