'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api-client'

const ConversationalSearchPanel = dynamic(
  () => import('@/components/conversational-search/conversational-search-panel').then(m => ({ default: m.ConversationalSearchPanel })),
  { ssr: false },
)

interface Props {
  propertyId?: number
  orgId?: number
  whatsappPrefilledMessage?: string
}

export function ChatWidget({ propertyId, orgId, whatsappPrefilledMessage }: Props) {
  const [aiOpen, setAiOpen] = useState(false)

  const { data: chatConfig } = useQuery({
    queryKey: ['chat-config', propertyId],
    queryFn: () => apiClient.getChatConfig(propertyId),
    enabled: !!propertyId,
    staleTime: 60_000,
  })

  const aiEnabled = chatConfig?.aiEnabled ?? false
  const whatsappNumber = chatConfig?.whatsappNumber ?? null

  if (!aiEnabled && !whatsappNumber) return null

  function openWhatsApp() {
    const num = whatsappNumber!.replace(/\D/g, '')
    const name = chatConfig?.name
    const text = whatsappPrefilledMessage
      ?? (name ? `Hello, I'd like to find out about ${name}.` : `Hello, I'd like to find out about your property.`)
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      {/* Floating buttons — bottom-right, side by side */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        {whatsappNumber && (
          <button
            onClick={openWhatsApp}
            aria-label="Chat on WhatsApp"
            title="Chat on WhatsApp"
            className="h-14 w-14 rounded-full shadow-xl transition-all hover:shadow-2xl hover:scale-105 active:scale-95 overflow-hidden"
          >
            <img src="/whatsapp-icon.png" alt="WhatsApp" className="h-full w-full" />
          </button>
        )}

        {aiEnabled && (
          <button
            onClick={() => setAiOpen(prev => !prev)}
            aria-label={aiOpen ? 'Close AI chat' : 'Chat with AI'}
            title="Chat with AI"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-xl transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-2xl active:scale-95"
          >
            {aiOpen ? (
              <CloseIcon className="h-6 w-6" />
            ) : (
              <div className="flex flex-col items-center gap-0.5 leading-none">
                <SparkleIcon className="h-5 w-5" />
                <span className="text-[11px] font-bold tracking-widest">AI</span>
              </div>
            )}
          </button>
        )}
      </div>

      {/* Backdrop */}
      {aiOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setAiOpen(false)}
        />
      )}

      {/* AI chat panel */}
      {aiOpen && (
        <div className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col shadow-2xl sm:w-[420px]">
          <ConversationalSearchPanel
            {...(propertyId ? { propertyId } : {})}
            {...(orgId ? { orgId } : {})}
            onClose={() => setAiOpen(false)}
            className="h-full"
          />
        </div>
      )}
    </>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 1 L10.8 7.2 L17 9 L10.8 10.8 L9 17 L7.2 10.8 L1 9 L7.2 7.2 Z" />
      <path d="M18.5 1 L19.6 4.9 L23.5 6 L19.6 7.1 L18.5 11 L17.4 7.1 L13.5 6 L17.4 4.9 Z" />
      <path d="M20 14 L20.8 16.7 L23.5 17.5 L20.8 18.3 L20 21 L19.2 18.3 L16.5 17.5 L19.2 16.7 Z" />
    </svg>
  )
}


function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
