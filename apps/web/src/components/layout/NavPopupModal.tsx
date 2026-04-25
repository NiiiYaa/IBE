'use client'

import { useEffect, useMemo } from 'react'

interface NavPopupModalProps {
  label: string
  content: string
  onClose: () => void
}

export function NavPopupModal({ label, content, onClose }: NavPopupModalProps) {
  const isHtml = content.trimStart().startsWith('<')
  const safeHtml = useMemo(() => {
    if (!isHtml || typeof window === 'undefined') return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOMPurify = (require('dompurify') as any).default ?? require('dompurify')
    return DOMPurify.sanitize(content) as string
  }, [isHtml, content])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-[var(--color-surface)] p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text)]">{label}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {safeHtml ? (
            <div
              className="prose prose-sm max-w-none text-[var(--color-text-muted)]"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-muted)]">
              {content}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
