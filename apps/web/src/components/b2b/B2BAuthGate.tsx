'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { apiClient, ApiClientError } from '@/lib/api-client'

interface Props {
  sellerSlug: string
  children: React.ReactNode
}

export function B2BAuthGate({ sellerSlug, children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    apiClient.b2bMe()
      .then(() => setChecked(true))
      .catch((err) => {
        if (err instanceof ApiClientError && err.status === 401) {
          router.replace(`/b2b/login?returnTo=${encodeURIComponent(pathname)}&seller=${encodeURIComponent(sellerSlug)}`)
        } else {
          // Network error or similar — still allow through, API calls will handle auth errors
          setChecked(true)
        }
      })
  }, [pathname, router, sellerSlug])

  if (!checked) return null

  return <>{children}</>
}
