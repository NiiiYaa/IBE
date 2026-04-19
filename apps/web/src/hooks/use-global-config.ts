'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrgDesignDefaultsConfig } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'

export type GlobalDraft = Partial<OrgDesignDefaultsConfig>

export function useGlobalConfig() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<GlobalDraft>({})
  const [saved, setSaved] = useState(false)
  const initialized = useRef(false)
  const savedSnapshot = useRef<GlobalDraft | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['global-design-defaults'],
    queryFn: () => apiClient.getGlobalDesignDefaults(),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setDraft(data)
      savedSnapshot.current = data
    }
  }, [data])

  const { mutate, isPending } = useMutation({
    mutationFn: (d: GlobalDraft) => apiClient.updateGlobalDesignDefaults(d),
    onSuccess: (fresh) => {
      qc.setQueryData(['global-design-defaults'], fresh)
      savedSnapshot.current = fresh
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  function set<K extends keyof GlobalDraft>(key: K, value: GlobalDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const isDirty = savedSnapshot.current !== null && JSON.stringify(draft) !== JSON.stringify(savedSnapshot.current)

  return { isLoading, draft, set, save: () => mutate(draft), isPending, saved, isDirty }
}
