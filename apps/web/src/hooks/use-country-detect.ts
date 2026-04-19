import { useState, useEffect } from 'react'

/**
 * Detects the user's country from their IP via ipapi.co.
 * Returns a 2-letter ISO country code, or '' while loading / on failure.
 */
export function useCountryDetect(): string {
  const [code, setCode] = useState('')

  useEffect(() => {
    fetch('/api/geo')
      .then(r => r.json())
      .then((d: unknown) => {
        if (
          d !== null &&
          typeof d === 'object' &&
          'country_code' in d &&
          typeof (d as { country_code: unknown }).country_code === 'string'
        ) {
          setCode((d as { country_code: string }).country_code)
        }
      })
      .catch(() => {})
  }, [])

  return code
}
