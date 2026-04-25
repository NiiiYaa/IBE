import { useState, useEffect } from 'react'

const STORAGE_KEY = 'ibe-nationality'

/**
 * Detects the user's country from their IP via ipapi.co.
 * Returns a 2-letter ISO country code, or '' while loading / on failure.
 * Persists the detected code to localStorage so subsequent loads are instant.
 */
export function useCountryDetect(): string {
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    if (code) return // already have a value (from storage or a prior detection)
    fetch('/api/geo')
      .then(r => r.json())
      .then((d: unknown) => {
        if (
          d !== null &&
          typeof d === 'object' &&
          'country_code' in d &&
          typeof (d as { country_code: unknown }).country_code === 'string'
        ) {
          const detected = (d as { country_code: string }).country_code
          if (detected) {
            try { localStorage.setItem(STORAGE_KEY, detected) } catch { /* ignore */ }
            setCode(detected)
          }
        }
      })
      .catch(() => {})
  }, [])

  return code
}
