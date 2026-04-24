import { env } from '../config/env.js'

export function cookieDomain(): string | undefined {
  try {
    const host = new URL(env.WEB_BASE_URL).hostname
    if (host === 'localhost') return undefined
    // Strip www. so cookie is scoped to root domain (works across all subdomains)
    const root = host.replace(/^www\./, '')
    return `.${root}`
  } catch {
    return undefined
  }
}
