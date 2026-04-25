'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgNavItem, NavItemSection, NavItemType, CreateOrgNavItemRequest } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'

const TYPE_LABELS: Record<NavItemType, string> = {
  static: 'Static text',
  link: 'Link',
  popup: 'Popup',
  'popup-rich': 'Popup (rich text)',
}

interface OrgNavItemEditorProps {
  section: NavItemSection
  title: string
}

export function OrgNavItemEditor({ section, title }: OrgNavItemEditorProps) {
  const qc = useQueryClient()
  const qKey = ['org-nav-items', section]

  const { data: items = [], isLoading } = useQuery<OrgNavItem[]>({
    queryKey: qKey,
    queryFn: () => apiClient.getOrgNavItems(section),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: qKey })

  const createMut = useMutation({
    mutationFn: (data: CreateOrgNavItemRequest) => apiClient.createOrgNavItem({ ...data, section }),
    onSuccess: invalidate,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<OrgNavItem>) =>
      apiClient.updateOrgNavItem(id, data),
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteOrgNavItem(id),
    onSuccess: invalidate,
  })

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => apiClient.reorderOrgNavItems(ids),
    onSuccess: invalidate,
  })

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function moveUp(idx: number) {
    if (idx === 0) return
    const ids = items.map(i => i.id)
    ;[ids[idx - 1], ids[idx]] = [ids[idx]!, ids[idx - 1]!]
    reorderMut.mutate(ids)
  }

  function moveDown(idx: number) {
    if (idx === items.length - 1) return
    const ids = items.map(i => i.id)
    ;[ids[idx], ids[idx + 1]] = [ids[idx + 1]!, ids[idx]!]
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

      {isLoading && (
        <div className="flex h-20 items-center justify-center text-sm text-[var(--color-text-muted)]">
          Loading…
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, idx) =>
          editingId === item.id ? (
            <OrgNavItemForm
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
          <OrgNavItemForm
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
        <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
          No items yet. Click &ldquo;Add item&rdquo; to get started.
        </p>
      )}
    </div>
  )
}

interface OrgNavItemFormProps {
  section: NavItemSection
  initial?: Partial<OrgNavItem>
  onSave: (data: Omit<CreateOrgNavItemRequest, 'section'>) => void
  onCancel: () => void
}

function OrgNavItemForm({ initial, onSave, onCancel }: OrgNavItemFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [type, setType] = useState<NavItemType>(initial?.type ?? 'link')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [plainContent, setPlainContent] = useState(initial?.type === 'popup' ? (initial?.content ?? '') : '')
  const [richContent, setRichContent] = useState(initial?.type === 'popup-rich' ? (initial?.content ?? '') : '')

  const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    onSave({
      label: label.trim(),
      type,
      url: type === 'link' ? url : null,
      content: type === 'popup' ? plainContent : type === 'popup-rich' ? richContent : null,
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
            <option value="popup-rich">Popup with rich text</option>
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
            value={plainContent}
            onChange={e => setPlainContent(e.target.value)}
            placeholder="Enter the text to show in the popup…"
            rows={5}
            className={inputCls}
          />
        </div>
      )}

      {type === 'popup-rich' && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Popup content</label>
          <RichTextEditor value={richContent} onChange={setRichContent} />
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

function RichTextEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function exec(command: string, val?: string) {
    document.execCommand(command, false, val)
    if (ref.current) onChange(ref.current.innerHTML)
  }
  function clearAll() {
    if (!ref.current) return
    const text = (ref.current.innerText ?? '').trim()
    ref.current.innerHTML = text.split('\n').filter(Boolean).join('<br>')
    onChange(ref.current.innerHTML)
  }
  const btnCls = 'rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-colors'
  function tb(label: React.ReactNode, action: () => void) {
    return (
      <button type="button" className={btnCls} onMouseDown={(e) => { e.preventDefault(); action() }}>
        {label}
      </button>
    )
  }
  return (
    <div className="rounded-lg border border-[var(--color-border)]">
      <div className="flex flex-wrap gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 rounded-t-lg">
        {tb(<strong>B</strong>, () => exec('bold'))}
        {tb(<em>I</em>, () => exec('italic'))}
        {tb(<span className="underline">U</span>, () => exec('underline'))}
        <span className="mx-1 w-px self-stretch bg-[var(--color-border)]" />
        {tb('• List', () => exec('insertUnorderedList'))}
        {tb('1. List', () => exec('insertOrderedList'))}
        <span className="mx-1 w-px self-stretch bg-[var(--color-border)]" />
        <button type="button" className={btnCls} onMouseDown={(e) => { e.preventDefault(); const url = window.prompt('URL:'); if (url) exec('createLink', url) }}>Link</button>
        {tb('Unlink', () => exec('unlink'))}
        <span className="mx-1 w-px self-stretch bg-[var(--color-border)]" />
        {tb('Clear', clearAll)}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { if (ref.current) onChange(ref.current.innerHTML) }}
        className="px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none rounded-b-lg [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5"
        style={{ lineHeight: '1.6', minHeight: '120px', resize: 'vertical', overflow: 'auto' }}
      />
    </div>
  )
}
