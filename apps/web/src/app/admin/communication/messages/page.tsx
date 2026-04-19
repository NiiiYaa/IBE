'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MessageRule, MessageTrigger, MessageChannel, MessageOffsetUnit, MessageDirection } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { useAdminProperty } from '../../property-context'

// ── Constants ──────────────────────────────────────────────────────────────────

const TRIGGERS: { value: MessageTrigger; label: string }[] = [
  { value: 'booking_confirmed', label: 'Booking completion' },
  { value: 'booking_cancelled', label: 'Booking cancellation' },
  { value: 'cancellation_deadline', label: 'Cancellation deadline' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'checkout', label: 'Check-out' },
]

const CHANNELS: { value: MessageChannel; label: string; icon: string }[] = [
  { value: 'email', label: 'Email', icon: '✉' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'sms', label: 'SMS', icon: '📱' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function timingLabel(rule: MessageRule): string {
  const trigger = TRIGGERS.find(t => t.value === rule.trigger)?.label ?? rule.trigger
  if (rule.offsetValue === 0) return `Immediately after ${trigger.toLowerCase()}`
  const unit = rule.offsetValue === 1 ? rule.offsetUnit.replace(/s$/, '') : rule.offsetUnit
  return `${rule.offsetValue} ${unit} ${rule.direction} ${trigger.toLowerCase()}`
}

function effectiveEnabled(rule: MessageRule): boolean {
  return rule.propertyEnabled ?? rule.enabled
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  name: string
  enabled: boolean
  channels: MessageChannel[]
  trigger: MessageTrigger
  immediate: boolean
  offsetValue: number
  offsetUnit: MessageOffsetUnit
  direction: MessageDirection
}

const DEFAULT_FORM: FormState = {
  name: '',
  enabled: true,
  channels: ['email'],
  trigger: 'booking_confirmed',
  immediate: true,
  offsetValue: 1,
  offsetUnit: 'hours',
  direction: 'after',
}

function ruleToForm(rule: MessageRule): FormState {
  return {
    name: rule.name,
    enabled: rule.enabled,
    channels: rule.channels as MessageChannel[],
    trigger: rule.trigger as MessageTrigger,
    immediate: rule.offsetValue === 0,
    offsetValue: rule.offsetValue || 1,
    offsetUnit: rule.offsetUnit as MessageOffsetUnit,
    direction: rule.direction as MessageDirection,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { propertyId } = useAdminProperty()
  return <MessagesEditor propertyId={propertyId} />
}

function MessagesEditor({ propertyId }: { propertyId: number | null | undefined }) {
  const scopedPropertyId = propertyId === null ? null : (propertyId ?? undefined)
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [rules, setRules] = useState<MessageRule[]>([])
  const [error, setError] = useState<string | null>(null)

  const queryKey = useMemo(() => ['message-rules', scopedPropertyId ?? 'global'], [scopedPropertyId])

  const { data: serverRules, isLoading } = useQuery<MessageRule[]>({
    queryKey,
    queryFn: () => apiClient.listMessageRules(scopedPropertyId),
  })

  useEffect(() => { if (serverRules !== undefined) setRules(serverRules) }, [serverRules])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleChannel(ch: MessageChannel) {
    set('channels', form.channels.includes(ch)
      ? form.channels.filter(c => c !== ch)
      : [...form.channels, ch])
  }

  function openAdd() {
    setForm(DEFAULT_FORM)
    setEditingId(null)
    setShowForm(true)
    setError(null)
  }

  function openEdit(rule: MessageRule) {
    setForm(ruleToForm(rule))
    setEditingId(rule.id)
    setShowForm(true)
    setError(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setError(null)
  }

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        enabled: form.enabled,
        channels: form.channels,
        trigger: form.trigger,
        offsetValue: form.immediate ? 0 : form.offsetValue,
        offsetUnit: form.offsetUnit,
        direction: form.direction,
        propertyId: scopedPropertyId ?? null,
      }
      return editingId !== null
        ? apiClient.updateMessageRule(editingId, payload)
        : apiClient.createMessageRule(payload)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey })
      closeForm()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Save failed'),
  })

  const { mutate: toggle } = useMutation<void, unknown, { id: number; enabled: boolean; isGlobal: boolean }>({
    mutationFn: async ({ id, enabled, isGlobal }) => {
      if (isGlobal && scopedPropertyId != null) {
        await apiClient.setPropertyOverride({ entityType: 'message_rule', entityId: id, propertyId: scopedPropertyId, isEnabled: enabled })
      } else {
        await apiClient.updateMessageRule(id, { enabled })
      }
    },
    onMutate: ({ id, enabled, isGlobal }) => {
      setRules(prev => prev.map(r => {
        if (r.id !== id) return r
        if (isGlobal && scopedPropertyId != null) return { ...r, propertyEnabled: enabled }
        return { ...r, enabled }
      }))
    },
    onError: () => void qc.invalidateQueries({ queryKey }),
  })

  async function handleDelete(id: number) {
    setRules(prev => prev.filter(r => r.id !== id))
    setDeleteConfirm(null)
    try {
      await apiClient.deleteMessageRule(id)
      void qc.invalidateQueries({ queryKey })
    } catch {
      void qc.invalidateQueries({ queryKey })
    }
  }

  const inputCls = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-light)]'
  const selectCls = inputCls

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Messages</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {scopedPropertyId == null
              ? 'Global defaults — apply to all properties unless overridden at the property level.'
              : 'Define which messages to send guests and when. Global rules are inherited and shown below.'}
          </p>
        </div>
        {!showForm && (
          <button onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add message
          </button>
        )}
      </div>

      {/* ── Form ──────────────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-surface)] p-6">
          <h2 className="mb-5 text-sm font-semibold text-[var(--color-text)]">
            {editingId !== null ? 'Edit message' : 'New message'}
          </h2>

          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Name</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Booking Confirmation" className={inputCls + ' w-full'} />
            </div>

            {/* Channels */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Send via</label>
              <div className="flex gap-2">
                {CHANNELS.map(ch => (
                  <button key={ch.value} type="button" onClick={() => toggleChannel(ch.value)}
                    className={['flex items-center gap-1.5 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all',
                      form.channels.includes(ch.value)
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-light)]',
                    ].join(' ')}>
                    <span>{ch.icon}</span> {ch.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timing */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">When to send</label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--color-text-muted)]">Send</span>

                {/* Immediate toggle */}
                <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-sm">
                  <button type="button" onClick={() => set('immediate', true)}
                    className={['px-3 py-1.5 font-medium transition-colors',
                      form.immediate ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-background)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'
                    ].join(' ')}>
                    immediately
                  </button>
                  <button type="button" onClick={() => set('immediate', false)}
                    className={['px-3 py-1.5 font-medium transition-colors',
                      !form.immediate ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-background)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'
                    ].join(' ')}>
                    scheduled
                  </button>
                </div>

                {!form.immediate && (
                  <>
                    <input type="number" min={1} max={999} value={form.offsetValue}
                      onChange={e => set('offsetValue', Math.max(1, Number(e.target.value)))}
                      className={inputCls + ' w-20 text-center'} />

                    <select value={form.offsetUnit} onChange={e => set('offsetUnit', e.target.value as MessageOffsetUnit)}
                      className={selectCls}>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>

                    <select value={form.direction} onChange={e => set('direction', e.target.value as MessageDirection)}
                      className={selectCls}>
                      <option value="before">before</option>
                      <option value="after">after</option>
                    </select>
                  </>
                )}

                {/* Trigger */}
                <select value={form.trigger} onChange={e => set('trigger', e.target.value as MessageTrigger)}
                  className={selectCls}>
                  {TRIGGERS.map(t => (
                    <option key={t.value} value={t.value}>{t.label.toLowerCase()}</option>
                  ))}
                </select>
              </div>

              {/* Preview sentence */}
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                {form.immediate
                  ? `Immediately after ${TRIGGERS.find(t => t.value === form.trigger)?.label.toLowerCase()}`
                  : `${form.offsetValue} ${form.offsetValue === 1 ? form.offsetUnit.replace(/s$/, '') : form.offsetUnit} ${form.direction} ${TRIGGERS.find(t => t.value === form.trigger)?.label.toLowerCase()}`
                }
              </p>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Status</label>
              <button type="button" onClick={() => set('enabled', !form.enabled)}
                className={['relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                  form.enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
                <span className={['pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                  form.enabled ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
              </button>
              <span className="text-sm text-[var(--color-text-muted)]">{form.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-4 py-2 text-sm text-[var(--color-error)]">
              {error}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button onClick={() => save()} disabled={isSaving || !form.name.trim() || form.channels.length === 0}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Add message'}
            </button>
            <button onClick={closeForm}
              className="rounded-lg border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Rules list ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-14 text-center">
          <p className="text-sm font-medium text-[var(--color-text-muted)]">No message rules yet</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Add your first message to start communicating with guests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => {
            const isGlobalInPropView = rule.isGlobal && scopedPropertyId != null
            const enabled = effectiveEnabled(rule)
            const hasOverride = rule.propertyEnabled !== null
            return (
              <div key={rule.id}
                className={['rounded-xl border bg-[var(--color-surface)] px-5 py-4 transition-opacity',
                  editingId === rule.id ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary-light)]' : 'border-[var(--color-border)]',
                  !enabled && editingId !== rule.id ? 'opacity-60' : '',
                ].join(' ')}>
                <div className="flex items-start gap-4">
                  {/* Toggle */}
                  <button type="button"
                    onClick={() => toggle({ id: rule.id, enabled: !enabled, isGlobal: rule.isGlobal })}
                    title={enabled ? 'Disable' : 'Enable'}
                    className={['relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                      enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')}>
                    <span className={['pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                      enabled ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--color-text)]">{rule.name}</p>
                      {isGlobalInPropView && (
                        <span className="rounded-full bg-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Global</span>
                      )}
                      {isGlobalInPropView && hasOverride && (
                        <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">Overridden</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{timingLabel(rule)}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(rule.channels as MessageChannel[]).map(ch => {
                        const meta = CHANNELS.find(c => c.value === ch)
                        return (
                          <span key={ch}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
                            {meta?.icon} {meta?.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {/* Actions — hidden for inherited global rules */}
                  {!isGlobalInPropView && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(rule)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]">
                        Edit
                      </button>
                      {deleteConfirm === rule.id ? (
                        <>
                          <button onClick={() => handleDelete(rule.id)}
                            className="rounded-md bg-[var(--color-error)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">
                            Confirm
                          </button>
                          <button onClick={() => setDeleteConfirm(null)}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setDeleteConfirm(rule.id)}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--color-error)]/70 transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]">
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
