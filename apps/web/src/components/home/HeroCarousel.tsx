'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

interface HeroCarouselProps {
  images: string[]
  alt: string
  variant: 'fullpage' | 'rectangle'
  intervalSeconds?: number
  showDots?: boolean
}

export function HeroCarousel({ images, alt, variant, intervalSeconds = 5, showDots = true }: HeroCarouselProps) {
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startTimer() {
    if (images.length <= 1) return
    timerRef.current = setInterval(
      () => setCurrent(i => (i + 1) % images.length),
      intervalSeconds * 1000,
    )
  }

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    startTimer()
  }

  useEffect(() => {
    startTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, intervalSeconds])

  function prev() {
    setCurrent(i => (i - 1 + images.length) % images.length)
    resetTimer()
  }

  function next() {
    setCurrent(i => (i + 1) % images.length)
    resetTimer()
  }

  if (images.length === 0) {
    return <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-600" />
  }

  return (
    <div className="absolute inset-0">
      {images.map((src, idx) => (
        <Image
          key={src}
          src={src}
          alt={alt}
          fill
          priority={idx === 0}
          unoptimized
          sizes="100vw"
          className={[
            'object-cover transition-opacity duration-1000',
            idx === current ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
      ))}

      {images.length > 1 && (
        <>
          {/* Prev arrow */}
          <button
            onClick={prev}
            aria-label="Previous image"
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Next arrow */}
          <button
            onClick={next}
            aria-label="Next image"
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Dot indicators */}
          {showDots && (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => { setCurrent(idx); resetTimer() }}
                  aria-label={`Image ${idx + 1}`}
                  className={[
                    'h-1.5 rounded-full transition-all',
                    idx === current ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80',
                  ].join(' ')}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
