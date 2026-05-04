import { env } from '../config/env.js'

// Dynamic-DNS / wildcard services (nip.io, sslip.io, xip.io) embed IPs in the hostname.
// Browsers treat each IP-subdomain as a public suffix, so domain-scoped cookies are
// rejected outright. Return undefined so the browser gets a host-only cookie instead.
const WILDCARD_DNS = ['.nip.io', '.sslip.io', '.xip.io']

export function cookieDomain(): string | undefined {
  try {
    const host = new URL(env.WEB_BASE_URL).hostname
    if (host === 'localhost') return undefined
    if (WILDCARD_DNS.some(s => host.endsWith(s))) return undefined
    // Strip www. so cookie is scoped to root domain (works across all subdomains)
    const root = host.replace(/^www\./, '')
    return `.${root}`
  } catch {
    return undefined
  }
}
