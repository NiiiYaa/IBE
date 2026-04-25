import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isPrivateIp(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}

export async function GET(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').at(0)?.trim()
  const realIp = request.headers.get('x-real-ip')

  // Skip private/LAN IPs — they can't be geolocated; fall back to a public IP
  const candidate = forwarded ?? realIp ?? ''
  const ip = candidate && !isPrivateIp(candidate) ? candidate : '8.8.8.8'

  try {
    const res = await fetch(`https://ipapi.co/${ip}/country_code/`, {
      headers: { 'User-Agent': 'IBE/1.0' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      return NextResponse.json({ country_code: '' })
    }
    const text = (await res.text()).trim()
    const country_code = /^[A-Z]{2}$/.test(text) ? text : ''
    return NextResponse.json(
      { country_code },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    )
  } catch {
    return NextResponse.json({ country_code: '' })
  }
}
