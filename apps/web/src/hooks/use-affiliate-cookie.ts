'use client'

import { useEffect } from 'react'

const COOKIE_NAME = 'ibe_affiliate'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

export function useSetAffiliateCookie(code: string | undefined) {
  useEffect(() => {
    if (!code) return
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(code)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  }, [code])
}

export function readAffiliateCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  return match ? decodeURIComponent(match[1]!) : undefined
}
