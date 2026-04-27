'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig, GlobalDesignAdminResponse } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'
import { useAdminAuth } from './use-admin-auth'
import { useAdminProperty } from '@/app/admin/property-context'

export type GlobalDraft = Partial<OrgDesignDefaultsConfig>

export function useGlobalConfig() {
  const qc = useQueryClient()
  const { admin } = useAdminAuth()
  const { orgId: ctxOrgId } = useAdminProperty()
  const isSuper = admin?.role === 'super'
  const resolvedOrgId: number | undefined = isSuper
    ? (ctxOrgId ?? undefined)
    : (admin?.organizationId ?? undefined)

  const [draft, setDraft] = useState<GlobalDraft>({})
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const initialized = useRef(false)
  const savedSnapshot = useRef<GlobalDraft | null>(null)

  // Reset local state when the active org changes (super admin switching orgs)
  useEffect(() => {
    initialized.current = false
    savedSnapshot.current = null
    setDraft({})
    setSaveError(null)
  }, [resolvedOrgId])

  const { data, isLoading } = useQuery<GlobalDesignAdminResponse>({
    queryKey: ['global-design-defaults', resolvedOrgId ?? null],
    queryFn: () => apiClient.getGlobalDesignDefaults(resolvedOrgId),
    staleTime: 0,
    enabled: resolvedOrgId != null,
  })

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setDraft(data.overrides)
      savedSnapshot.current = data.overrides
    }
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: GlobalDraft) => apiClient.updateGlobalDesignDefaults(d, resolvedOrgId),
    onSuccess: (fresh) => {
      qc.setQueryData(['global-design-defaults', resolvedOrgId ?? null], fresh)
      savedSnapshot.current = fresh.overrides
      setSaved(true)
      setSaveError(null)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setSaveError(msg)
    },
  })

  function set<K extends keyof GlobalDraft>(key: K, value: GlobalDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const isDirty = savedSnapshot.current !== null && JSON.stringify(draft) !== JSON.stringify(savedSnapshot.current)

  function buildDiff(): GlobalDraft {
    const snapshot = savedSnapshot.current
    if (!snapshot) return draft
    const diff: GlobalDraft = {}
    for (const k of Object.keys(draft) as (keyof GlobalDraft)[]) {
      const a = draft[k], b = snapshot[k]
      const changed = Array.isArray(a) || typeof a === 'object'
        ? JSON.stringify(a) !== JSON.stringify(b)
        : a !== b
      if (changed) (diff as Record<string, unknown>)[k] = a
    }
    return Object.keys(diff).length > 0 ? diff : draft
  }

  const systemDefaults = data?.systemDefaults ?? ({} as OrgDesignDefaultsConfig)

  return { isLoading, draft, set, save: () => mutate(buildDiff()), isPending, saved, isDirty, saveError, systemDefaults }
}
