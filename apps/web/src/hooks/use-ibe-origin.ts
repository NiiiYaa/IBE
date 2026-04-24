import { useState, useEffect } from 'react'

// Returns an absolute IBE origin like "https://grandhotel.hyperguest.net" after mount,
// or null on localhost / IP addresses / Render.com internal URLs.
// Pass the property subdomain or org slug to build the correct URL regardless of
// which admin subdomain you're currently on.
export function useIbeOrigin(subdomain?: string | null): string | null {
  const [origin, setOrigin] = useState<string | null>(null)

  useEffect(() => {
    if (!subdomain) return
    const { protocol, hostname, port } = window.location
    if (
      hostname === 'localhost' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ||
      hostname.endsWith('.onrender.com')
    ) {
      return
    }
    const parts = hostname.split('.')
    if (parts.length >= 2) {
      const baseDomain = parts.slice(1).join('.')
      setOrigin(`${protocol}//${subdomain}.${baseDomain}${port ? `:${port}` : ''}`)
    }
  }, [subdomain])

  return origin
}
