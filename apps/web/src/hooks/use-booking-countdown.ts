'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const DURATION_MS = 30 * 60 * 1000

function readOrInitStartTime(storageKey: string): number {
  try {
    const stored = sessionStorage.getItem(storageKey)
    if (stored) {
      const t = Number(stored)
      if (!isNaN(t) && Date.now() - t < DURATION_MS) return t
    }
  } catch { /* sessionStorage unavailable */ }
  const now = Date.now()
  try { sessionStorage.setItem(storageKey, String(now)) } catch {}
  return now
}

export function useBookingCountdown(storageKey: string) {
  const [startTime, setStartTime] = useState<number>(() => readOrInitStartTime(storageKey))
  const [now, setNow] = useState<number>(() => Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const reset = useCallback(() => {
    const t = Date.now()
    try { sessionStorage.setItem(storageKey, String(t)) } catch {}
    setStartTime(t)
    setNow(t)
  }, [storageKey])

  const timeLeftMs = Math.max(0, DURATION_MS - (now - startTime))
  const isExpired = timeLeftMs === 0

  return { timeLeftMs, isExpired, reset }
}
