'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { HeaderMapData } from '@/components/layout/Header'

const MapModal = dynamic(() => import('./MapModal'), { ssr: false })

export function MapButton({ mapData }: { mapData: HeaderMapData }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={mapData.mode === 'hotel' ? 'View hotel on map' : 'View all hotels on map'}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="hidden sm:inline">Map</span>
      </button>

      {open && <MapModal data={mapData} onClose={() => setOpen(false)} />}
    </>
  )
}
