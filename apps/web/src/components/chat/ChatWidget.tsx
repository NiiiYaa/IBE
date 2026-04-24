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
  const [menuOpen, setMenuOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const { data: chatConfig } = useQuery({
    queryKey: ['chat-config', propertyId],
    queryFn: () => apiClient.getChatConfig(propertyId),
    enabled: !!propertyId,
    staleTime: 60_000,
  })

  const aiEnabled = chatConfig?.aiEnabled ?? false
  const whatsappNumber = chatConfig?.whatsappNumber ?? null
  const hasOptions = aiEnabled || !!whatsappNumber

  if (!hasOptions) return null

  function openWhatsApp() {
    const num = whatsappNumber!.replace(/\D/g, '')
    const text = whatsappPrefilledMessage ?? 'Hello, I would like to find out more about your property.'
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    setMenuOpen(false)
  }

  function handleFabClick() {
    if (aiOpen) { setAiOpen(false); return }
    // If only one option, go directly
    if (aiEnabled && !whatsappNumber) { setAiOpen(true); return }
    if (!aiEnabled && whatsappNumber) { openWhatsApp(); return }
    // Both available — toggle menu
    setMenuOpen(prev => !prev)
  }

  function openAI() {
    setMenuOpen(false)
    setAiOpen(true)
  }

  return (
    <>
      {/* Floating action button + menu */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* Mini-menu (shown when both options available) */}
        {menuOpen && !aiOpen && (
          <div className="flex flex-col gap-2">
            {aiEnabled && (
              <button
                onClick={openAI}
                className="flex items-center gap-2 rounded-full bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] shadow-lg ring-1 ring-[var(--color-border)] transition hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
              >
                <span className="text-base leading-none">✦</span>
                Chat with AI
              </button>
            )}
            {whatsappNumber && (
              <button
                onClick={openWhatsApp}
                className="flex items-center gap-2 rounded-full bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] shadow-lg ring-1 ring-[var(--color-border)] transition hover:bg-green-50 hover:text-green-700"
              >
                <WhatsAppIcon className="h-4 w-4" />
                WhatsApp
              </button>
            )}
          </div>
        )}

        {/* FAB */}
        <button
          onClick={handleFabClick}
          aria-label="Start conversation"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-xl transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-2xl active:scale-95"
        >
          {aiOpen ? (
            <CloseIcon className="h-6 w-6" />
          ) : menuOpen ? (
            <CloseIcon className="h-6 w-6" />
          ) : aiEnabled && !whatsappNumber ? (
            <SparkleIcon className="h-6 w-6" />
          ) : !aiEnabled && whatsappNumber ? (
            <WhatsAppIcon className="h-6 w-6" />
          ) : (
            <ChatBubbleIcon className="h-6 w-6" />
          )}
        </button>
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
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.6H22l-6.4 4.6 2.4 7.6L12 17.2 5.6 21.8 8 14.2 1.6 9.6H9.6z" />
    </svg>
  )
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
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
