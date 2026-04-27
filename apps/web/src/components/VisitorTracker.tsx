'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const PAGE_LABELS: Record<string, string> = {
  '/':                        'home',
  '/search':                  'search',
  '/booking':                 'booking',
  '/groups':                  'groups',
  '/account/login':           'account-login',
  '/account/register':        'account-register',
  '/account/bookings':        'my-bookings',
  '/account/profile':         'profile',
}

function normalizePage(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname]
  if (pathname.startsWith('/booking/confirmation/')) return 'confirmation'
  if (pathname.startsWith('/booking/cross-sell/'))   return 'cross-sell'
  if (pathname.startsWith('/account/bookings/'))     return 'booking-detail'
  return 'other'
}

function getDevice(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile'
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet'
  // iPad on iOS 13+ reports as desktop UA — catch via touch + screen size
  if (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024) return 'tablet'
  return 'desktop'
}

function getSessionId(): string {
  const key = 'ibe_visit_session'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

export function VisitorTracker({ propertyId, channel }: { propertyId: number | null; channel: 'b2c' | 'b2b' }) {
  const pathname = usePathname()

  useEffect(() => {
    const sessionId = getSessionId()
    const page = normalizePage(pathname)
    const device = getDevice()
    void fetch(`${API_URL}/api/v1/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, propertyId, channel, page, device }),
    }).catch(() => { /* non-critical */ })
  }, [pathname, propertyId, channel])
}
