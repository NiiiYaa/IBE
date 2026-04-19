'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useHotelConfig } from '@/hooks/use-hotel-config'

interface DynamicBrandProps {
  fallbackLogoUrl?: string | null
  fallbackDisplayName?: string | null
}

export function DynamicBrand({ fallbackLogoUrl, fallbackDisplayName }: DynamicBrandProps) {
  const searchParams = useSearchParams()
  const hotelId = searchParams.get('hotelId') ? Number(searchParams.get('hotelId')) : null

  const { data: config } = useHotelConfig(hotelId)

  const logoUrl = config?.logoUrl ?? fallbackLogoUrl
  const displayName = config?.displayName ?? fallbackDisplayName
  const href = hotelId ? `/?hotelId=${hotelId}` : '/'

  return (
    <Link href={href} className="flex items-center gap-3">
      {logoUrl && (
        <Image
          src={logoUrl}
          alt={displayName ?? 'Hotel'}
          width={120}
          height={36}
          className="h-8 w-auto object-contain"
          unoptimized
        />
      )}
      <span className="text-lg font-semibold text-[var(--color-primary)]">
        {displayName ?? 'Hotel Booking'}
      </span>
    </Link>
  )
}
