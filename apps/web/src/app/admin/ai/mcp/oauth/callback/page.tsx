'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'

export default function McpOAuthCallbackPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')

    if (errorParam) {
      setStatus('error')
      setError(params.get('error_description') ?? errorParam)
      return
    }

    if (!code || !state) {
      setStatus('error')
      setError('Missing code or state from Auth0.')
      return
    }

    apiClient.linkMcpOAuth({ code, state })
      .then(() => {
        setStatus('success')
        setTimeout(() => router.replace('/admin/ai/mcp'), 1500)
      })
      .catch(err => {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to link account.')
      })
  }, [params, router])

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center space-y-3 max-w-sm">
        {status === 'processing' && (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-text-muted)]">Linking your OAuth account…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600 text-xl">✓</div>
            <p className="text-sm font-medium text-[var(--color-text)]">Account linked successfully!</p>
            <p className="text-xs text-[var(--color-text-muted)]">Redirecting back…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 text-xl">✕</div>
            <p className="text-sm font-medium text-[var(--color-text)]">OAuth linking failed</p>
            {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
            <button
              type="button"
              onClick={() => router.replace('/admin/ai/mcp')}
              className="mt-2 text-xs text-[var(--color-primary)] hover:underline"
            >
              Back to MCP settings
            </button>
          </>
        )}
      </div>
    </div>
  )
}
