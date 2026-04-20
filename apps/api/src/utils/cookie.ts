import { env } from '../config/env.js'

export function cookieDomain(): string | undefined {
  try {
    const host = new URL(env.WEB_BASE_URL).hostname
    return host === 'localhost' ? undefined : `.${host}`
  } catch {
    return undefined
  }
}
