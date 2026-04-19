'use client'

import { useEffect, useRef, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import type { OnsiteConversionSettings } from '@ibe/shared'

const HEARTBEAT_INTERVAL = 30_000 // 30s
const STATS_INTERVAL = 30_000

function getSessionId(): string {
  const key = 'ibe_session_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(key, id)
  }
  return id
}

export interface OnsiteConversionState {
  settings: OnsiteConversionSettings | null
  viewerCount: number
  recentBookingsCount: number
  popupPromoDiscount: number | null
  loaded: boolean
}

export function useOnsiteConversion(propertyId: number | null): OnsiteConversionState {
  const [state, setState] = useState<OnsiteConversionState>({
    settings: null,
    viewerCount: 0,
    recentBookingsCount: 0,
    popupPromoDiscount: null,
    loaded: false,
  })

  const propertyIdRef = useRef(propertyId)
  propertyIdRef.current = propertyId

  useEffect(() => {
    if (!propertyId) return

    let destroyed = false

    async function fetchStats() {
      if (!propertyIdRef.current) return
      try {
        const stats = await apiClient.getOnsiteStats(propertyIdRef.current)
        if (!destroyed) {
          setState(prev => ({
            ...prev,
            settings: stats.settings,
            viewerCount: stats.viewerCount,
            recentBookingsCount: stats.recentBookingsCount,
            popupPromoDiscount: stats.popupPromoDiscount,
            loaded: true,
          }))
        }
      } catch {
        if (!destroyed) setState(prev => ({ ...prev, loaded: true }))
      }
    }

    async function heartbeat() {
      if (!propertyIdRef.current) return
      try {
        const sessionId = getSessionId()
        const { viewerCount } = await apiClient.trackPresence(propertyIdRef.current, sessionId)
        if (!destroyed) {
          setState(prev => ({ ...prev, viewerCount }))
        }
      } catch {
        // ignore heartbeat failures
      }
    }

    fetchStats()
    heartbeat()

    const statsTimer = setInterval(fetchStats, STATS_INTERVAL)
    const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL)

    return () => {
      destroyed = true
      clearInterval(statsTimer)
      clearInterval(heartbeatTimer)
    }
  }, [propertyId])

  return state
}
