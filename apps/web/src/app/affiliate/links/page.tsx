'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export default function AffiliateLinksPage() {
  const [copied, setCopied] = useState<number | null>(null)

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['affiliate-links'],
    queryFn: () => apiClient.affiliateLinks(),
  })

  function copyUrl(id: number, url: string) {
    void navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  if (isLoading) return <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>

  if (links.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">My Links</h1>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            You haven&apos;t joined any hotel programs yet.{' '}
            <a href="/affiliate/hotels" className="text-[var(--color-primary)] hover:underline">Browse the marketplace</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">My Links</h1>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Hotel</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Code</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Commission</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Status</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
            {links.map(link => (
              <tr key={link.id}>
                <td className="px-4 py-3 text-[var(--color-text)]">{link.propertyName ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text)]">{link.code}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">
                  {link.commissionRate != null ? `${link.commissionRate}%` : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    link.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : link.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                  }`}>
                    {link.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => copyUrl(link.id, link.url)}
                    className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                  >
                    {copied === link.id ? 'Copied!' : 'Copy link'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
