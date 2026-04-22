import { useState, useEffect } from 'react'

// Returns the B2B origin (e.g. "https://grandhotel-b2b.hyperguest.net") after mount,
// or null when the current host doesn't support subdomain-based B2B routing
// (localhost, IP addresses, Render.com internal URLs).
// Computing this in useEffect avoids SSR/hydration mismatches.
export function useB2bOrigin(): string | null {
  const [origin, setOrigin] = useState<string | null>(null)

  useEffect(() => {
    const { protocol, hostname, port } = window.location
    if (
      hostname === 'localhost' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ||
      hostname.endsWith('.onrender.com')
    ) {
      return
    }
    const parts = hostname.split('.')
    if (parts.length >= 2 && parts[0]) {
      const sub = parts[0]
      parts[0] = sub.endsWith('-b2b') ? sub : `${sub}-b2b`
      setOrigin(`${protocol}//${parts.join('.')}${port ? `:${port}` : ''}`)
    }
  }, [])

  return origin
}
