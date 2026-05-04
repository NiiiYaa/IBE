'use client'

import { useEffect, useState } from 'react'

const SESSION_KEY = 'ibe-source-org'

export function useSourceOrg(): string | null {
  const [sourceOrg, setSourceOrg] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('source')
    if (fromUrl) {
      sessionStorage.setItem(SESSION_KEY, fromUrl)
      setSourceOrg(fromUrl)
    } else {
      setSourceOrg(sessionStorage.getItem(SESSION_KEY))
    }
  }, [])

  return sourceOrg
}
