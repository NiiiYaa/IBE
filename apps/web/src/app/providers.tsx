'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { PreferencesProvider } from '@/context/preferences'
import { SearchSelectionProvider } from '@/context/search-selection'

// Never SSR the devtools — they read from the browser DOM and produce
// different output on server vs client, causing hydration errors.
const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then(m => ({ default: m.ReactQueryDevtools })),
  { ssr: false },
)

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1 },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <SearchSelectionProvider>
          {children}
        </SearchSelectionProvider>
      </PreferencesProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
