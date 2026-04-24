'use client'

import { useState, useEffect } from 'react'
import { ZohoForm } from './ZohoForm'

const cardCls = 'flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md text-left'

const downloadIcon = (
  <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

const messageIcon = (
  <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const loginIcon = (
  <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
  </svg>
)

const externalIcon = (
  <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

export function LandingCards() {
  const [formOpen, setFormOpen] = useState(false)

  // Close on Escape
  useEffect(() => {
    if (!formOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFormOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [formOpen])

  // Prevent body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = formOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [formOpen])

  return (
    <>
      <div className="flex flex-col gap-4">

        {/* 1. IBE Whitepaper */}
        <a href="/HG-IBE-Admin-User-Manual.pdf" download className={cardCls}>
          <div>
            <p className="text-lg font-semibold text-gray-900">IBE Whitepaper</p>
            <p className="mt-1 text-sm text-gray-500">Download PDF</p>
          </div>
          {downloadIcon}
        </a>

        {/* 2. Get in touch */}
        <button type="button" onClick={() => setFormOpen(true)} className={cardCls}>
          <div>
            <p className="text-lg font-semibold text-gray-900">Get in touch</p>
            <p className="mt-1 text-sm text-gray-500">Send us a message</p>
          </div>
          {messageIcon}
        </button>

        {/* 3. IBE Admin Login */}
        <a href="/admin" className={cardCls}>
          <div>
            <p className="text-lg font-semibold text-gray-900">IBE Admin Login</p>
            <p className="mt-1 text-sm text-gray-500">Manage your booking engine</p>
          </div>
          {loginIcon}
        </a>

        {/* 4. HyperGuest.com */}
        <a href="https://www.hyperguest.com/" target="_blank" rel="noopener noreferrer" className={cardCls}>
          <div>
            <p className="text-lg font-semibold text-gray-900">HyperGuest</p>
            <p className="mt-1 text-sm text-gray-500">www.hyperguest.com</p>
          </div>
          {externalIcon}
        </a>
      </div>

      {/* Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setFormOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Panel */}
          <div
            className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Get in touch</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ZohoForm />
          </div>
        </div>
      )}
    </>
  )
}
