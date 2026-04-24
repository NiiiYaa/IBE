'use client'

import { useState } from 'react'

export function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-card">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-5 py-3 text-left"
      >
        <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
        <svg
          className={`h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`relative p-5 space-y-4 ${open ? '' : 'max-h-40 overflow-hidden'}`}>
        {children}
        <div className={`${open ? '' : 'absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--color-surface)] to-transparent'} flex items-end justify-center pb-2`}>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-semibold text-[var(--color-primary)] shadow-sm hover:bg-[var(--color-primary-light)] transition-colors"
          >
            <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {open ? 'Collapse' : 'Unfold'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function FormRow({ label, hint, children }: { label: string; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
        {hint && <span className="ml-1.5 font-normal normal-case text-[var(--color-text-muted)]/60">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

export function ColorRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string | undefined
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--color-border)] p-0.5"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
        {hint && <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
        <p className="font-mono text-xs text-[var(--color-text-muted)]">{value}</p>
      </div>
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string | undefined
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]"
    />
  )
}

export const selectCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`h-6 w-11 rounded-full transition-colors ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
        />
        <div
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
        {hint && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{hint}</p>}
      </div>
    </label>
  )
}

export function AgeTag({
  label,
  range,
  color,
}: {
  label: string
  range: string
  color: 'blue' | 'amber' | 'green'
}) {
  const cls = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  }[color]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-medium ${cls}`}>
      {label} <span className="opacity-60">({range})</span>
    </span>
  )
}

export function SaveButton({
  isPending,
  saved,
  onClick,
}: {
  isPending: boolean
  saved: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={isPending}
      className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 transition-colors"
    >
      {isPending ? 'Saving...' : saved ? 'Saved' : 'Save changes'}
    </button>
  )
}

export function SaveBar({
  isDirty,
  isSaving,
  onSave,
}: {
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
}) {
  if (!isDirty && !isSaving) return null
  return (
    <div
      className="fixed bottom-6 z-50 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-xl"
      style={{ right: 'max(24px, calc((100vw - 988px) / 2 + 24px))' }}
    >
      <p className="text-sm text-[var(--color-text-muted)]">Unsaved changes</p>
      <button
        onClick={onSave}
        disabled={isSaving}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
