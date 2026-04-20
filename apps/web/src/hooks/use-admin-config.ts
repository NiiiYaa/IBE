'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HotelDesignConfig, UpdateDesignConfigRequest } from '@ibe/shared'
import { apiClient } from '@/lib/api-client'

export function useAdminConfig(propertyId: number) {
  const qc = useQueryClient()

  const { data: config, isLoading } = useQuery<HotelDesignConfig>({
    queryKey: ['admin-config', propertyId],
    queryFn: () => apiClient.getHotelConfigAdmin(propertyId),
    enabled: propertyId > 0,
    staleTime: Infinity,
  })

  const [draft, setDraft] = useState<UpdateDesignConfigRequest>({})
  const [baseline, setBaseline] = useState<UpdateDesignConfigRequest>({})
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (config && config.propertyId === propertyId) {
      const normalized: UpdateDesignConfigRequest = {
        infantMaxAge: config.infantMaxAge,
        childMaxAge: config.childMaxAge,
        roomRatesDefaultExpanded: config.roomRatesDefaultExpanded,
        heroStyle: config.heroStyle ?? 'fullpage',
        heroImageMode: config.heroImageMode ?? 'fixed',
        heroCarouselInterval: config.heroCarouselInterval ?? 5,
        searchResultsImageMode: config.searchResultsImageMode ?? 'fixed',
        searchResultsCarouselInterval: config.searchResultsCarouselInterval ?? 5,
        searchResultsExcludedImageIds: config.searchResultsExcludedImageIds ?? [],
        excludedPropertyImageIds: config.excludedPropertyImageIds ?? [],
        excludedRoomImageIds: config.excludedRoomImageIds ?? [],
        roomPrimaryImageIds: config.roomPrimaryImageIds ?? {},
        tripadvisorHotelKey: config.tripadvisorHotelKey ?? null,
        defaultCurrency: config.defaultCurrency,
        defaultLocale: config.defaultLocale,
        textDirection: config.textDirection ?? 'ltr',
        onlinePaymentEnabled: config.onlinePaymentEnabled,
        payAtHotelEnabled: config.payAtHotelEnabled,
        payAtHotelCardGuaranteeRequired: config.payAtHotelCardGuaranteeRequired,
        colorPrimary: config.colorPrimary,
        colorPrimaryHover: config.colorPrimaryHover,
        colorPrimaryLight: config.colorPrimaryLight,
        colorAccent: config.colorAccent,
        colorBackground: config.colorBackground,
        colorSurface: config.colorSurface,
        colorText: config.colorText,
        colorTextMuted: config.colorTextMuted,
        colorBorder: config.colorBorder,
        colorSuccess: config.colorSuccess,
        colorError: config.colorError,
        fontFamily: config.fontFamily,
        borderRadius: config.borderRadius,
        logoUrl: config.logoUrl ?? '',
        faviconUrl: config.faviconUrl ?? '',
        heroImageUrl: config.heroImageUrl ?? '',
        searchResultsImageUrl: config.searchResultsImageUrl ?? '',
        displayName: config.displayName ?? '',
        tagline: config.tagline ?? '',
        tabTitle: config.tabTitle ?? '',
      }
      setDraft(normalized)
      setBaseline(normalized)
    }
  }, [config, propertyId])

  const { mutate, isPending } = useMutation({
    mutationFn: (updates: UpdateDesignConfigRequest) =>
      apiClient.updateHotelConfig(propertyId, updates),
    onSuccess: (fresh: HotelDesignConfig) => {
      qc.setQueryData(['admin-config', propertyId], fresh)
      qc.setQueryData(['hotel-config', propertyId], fresh)
      setSaveError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (err: unknown) => {
      setSaveError(err instanceof Error ? err.message : 'Unknown error')
    },
  })

  function set<K extends keyof UpdateDesignConfigRequest>(key: K, value: UpdateDesignConfigRequest[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline)

  function buildDiff(): UpdateDesignConfigRequest {
    const diff: UpdateDesignConfigRequest = {}
    for (const k of Object.keys(draft) as (keyof UpdateDesignConfigRequest)[]) {
      const a = draft[k], b = baseline[k]
      const changed = Array.isArray(a) || (typeof a === 'object' && a !== null)
        ? JSON.stringify(a) !== JSON.stringify(b)
        : a !== b
      if (changed) (diff as Record<string, unknown>)[k] = a
    }
    return Object.keys(diff).length > 0 ? diff : draft
  }

  return { config, isLoading, draft, set, save: () => mutate(buildDiff()), isPending, saved, saveError, isDirty }
}
