import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PLATFORM_HOST = 'hyperguest.net'
const SKIP_SUBDOMAINS = new Set(['www', 'admin', 'api'])

export function middleware(request: NextRequest) {
  const hostHeader = (request.headers.get('host') || '').split(':')
  const host = hostHeader[0] ?? ''

  // Skip local dev and Render internal hostnames
  if (
    host === 'localhost' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.endsWith('.onrender.com')
  ) {
    return NextResponse.next()
  }

  const headers = new Headers(request.headers)

  // Always propagate chain/hotelId query params as headers so layout can resolve the tenant
  const chain = request.nextUrl.searchParams.get('chain')
  const hotelId = request.nextUrl.searchParams.get('hotelId')
  if (chain) headers.set('x-tenant-chain', chain)
  if (hotelId) headers.set('x-tenant-hotel', hotelId)

  if (host === PLATFORM_HOST || host === `www.${PLATFORM_HOST}`) {
    return NextResponse.next({ request: { headers } })
  }

  if (host.endsWith(`.${PLATFORM_HOST}`)) {
    const subdomain = host.slice(0, -(PLATFORM_HOST.length + 1))
    if (subdomain && !SKIP_SUBDOMAINS.has(subdomain)) {
      headers.set('x-tenant-host', host)
      return NextResponse.next({ request: { headers } })
    }
    return NextResponse.next({ request: { headers } })
  }

  // Custom domain (e.g. book.grandhotel.com)
  headers.set('x-tenant-host', host)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
