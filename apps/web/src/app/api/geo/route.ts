import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Prefer the forwarded IP so this works behind a proxy / in prod
  const ip =
    request.headers.get('x-forwarded-for')?.split(',').at(0)?.trim() ??
    request.headers.get('x-real-ip') ??
    '8.8.8.8'

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
