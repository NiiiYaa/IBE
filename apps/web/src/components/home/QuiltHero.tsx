'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

const SLOT_COUNT = 5

interface SlotState {
  layers: [string, string]
  front: 0 | 1
}

interface QuiltHeroProps {
  images: string[]
  carousel: boolean
  intervalSeconds: number
  displayName: string
}

export function QuiltHero({ images, carousel, intervalSeconds, displayName }: QuiltHeroProps) {
  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: SLOT_COUNT }, (_, i) => {
      const url = images[i % Math.max(images.length, 1)] ?? ''
      return { layers: [url, url], front: 0 }
    })
  )

  const nextSlot = useRef(0)
  const nextImg = useRef(SLOT_COUNT)

  useEffect(() => {
    if (!carousel || images.length <= SLOT_COUNT) return

    const id = setInterval(() => {
      const slotIdx = nextSlot.current % SLOT_COUNT
      const imgUrl = images[nextImg.current % images.length] ?? ''

      setSlots(prev => {
        const updated = prev.map((s, i) => {
          if (i !== slotIdx) return s
          const back = (1 - s.front) as 0 | 1
          const layers = [...s.layers] as [string, string]
          layers[back] = imgUrl
          return { layers, front: back }
        })
        return updated
      })

      nextSlot.current++
      nextImg.current++
    }, intervalSeconds * 1000)

    return () => clearInterval(id)
  }, [carousel, images.length, intervalSeconds])

  function renderSlot(slotIdx: number, sizes: string) {
    const slot = slots[slotIdx]
    if (!slot) return null

    return (
      <>
        {slot.layers.map((url, layerIdx) =>
          url ? (
            <Image
              key={`${slotIdx}-${layerIdx}`}
              src={url}
              alt={slotIdx === 0 ? displayName : ''}
              fill
              unoptimized
              priority={slotIdx === 0 && layerIdx === 0}
              sizes={sizes}
              className={[
                'object-cover transition-opacity duration-1000',
                layerIdx === slot.front ? 'opacity-100' : 'opacity-0',
              ].join(' ')}
            />
          ) : null
        )}
      </>
    )
  }

  const mainImage = images[0]
  const hasGrid = images.length > 1

  return (
    <div className="flex h-[52vh] gap-1 overflow-hidden rounded-2xl">
      <div className="relative flex-[3]">
        {mainImage ? renderSlot(0, '60vw') : (
          <div className="h-full w-full bg-gradient-to-br from-slate-700 to-slate-500" />
        )}
      </div>

      {hasGrid && (
        <div className="grid flex-[2] grid-cols-2 grid-rows-2 gap-1">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="relative overflow-hidden">
              {i < images.length ? renderSlot(i, '20vw') : (
                <div className="h-full w-full bg-gradient-to-br from-slate-600 to-slate-400" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
