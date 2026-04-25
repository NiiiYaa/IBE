import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PLATFORM_HOST = 'hyperguest.net'
const SKIP_SUBDOMAINS = new Set(['www', 'admin', 'api'])

export function middleware(request: NextRequest) {
  const hostHeader = (request.headers.get('host') || '').split(':')
  const host = hostHeader[0] ?? ''

  const headers = new Headers(request.headers)

  // Always propagate chain/hotelId query params as headers so layout can resolve the tenant
  let chain = request.nextUrl.searchParams.get('chain')
  let hotelId = request.nextUrl.searchParams.get('hotelId')
  // Also parse from returnTo (e.g. /account/login?returnTo=/?chain=141185)
  if (!chain && !hotelId) {
    const returnTo = request.nextUrl.searchParams.get('returnTo')
    if (returnTo) {
      const rtp = new URLSearchParams(returnTo.split('?')[1] ?? '')
      chain = rtp.get('chain')
      hotelId = rtp.get('hotelId')
    }
  }
  if (chain) headers.set('x-tenant-chain', chain)
  if (hotelId) headers.set('x-tenant-hotel', hotelId)

  // For local dev and raw Render URLs: skip host-based tenant resolution but keep
  // chain/hotelId headers so ?hotelId= and ?chain= still work locally.
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.endsWith('.onrender.com')) {
    return NextResponse.next({ request: { headers } })
  }

  if (host === PLATFORM_HOST || host === `www.${PLATFORM_HOST}`) {
    const { pathname, search } = request.nextUrl
    const hasIbeParams = search.includes('chain=') || search.includes('hotelId=')
    if (pathname === '/' && !hasIbeParams) {
      return NextResponse.rewrite(new URL('/hyperguest-landing', request.url))
    }
    return NextResponse.next({ request: { headers } })
  }

  if (host.endsWith(`.${PLATFORM_HOST}`)) {
    const subdomain = host.slice(0, -(PLATFORM_HOST.length + 1))
    if (subdomain && !SKIP_SUBDOMAINS.has(subdomain)) {
      // Detect B2B subdomain: ends with -b2b (e.g. grandhotel-b2b.hyperguest.net)
      if (subdomain.endsWith('-b2b')) {
        const sellerSlug = subdomain.slice(0, -4) // strip "-b2b"
        headers.set('x-b2b-mode', 'true')
        headers.set('x-b2b-seller-slug', sellerSlug)
        // Use the seller slug for tenant resolution (same property/chain as B2C)
        headers.set('x-tenant-host', `${sellerSlug}.${PLATFORM_HOST}`)
      } else {
        headers.set('x-tenant-host', host)
      }
      return NextResponse.next({ request: { headers } })
    }
    return NextResponse.next({ request: { headers } })
  }

  // Custom domain (e.g. book.grandhotel.com)
  // Check for B2B custom domain convention: subdomain ending in -b2b
  const parts = host.split('.')
  if (parts.length >= 3 && parts[0]?.endsWith('-b2b')) {
    const sellerSubdomain = parts[0].slice(0, -4)
    const baseDomain = parts.slice(1).join('.')
    headers.set('x-b2b-mode', 'true')
    headers.set('x-b2b-seller-slug', sellerSubdomain)
    headers.set('x-tenant-host', `${sellerSubdomain}.${baseDomain}`)
  } else {
    headers.set('x-tenant-host', host)
  }

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
