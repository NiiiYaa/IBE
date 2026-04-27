'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useHotelConfig } from '@/hooks/use-hotel-config'
import { useProperty } from '@/hooks/use-property'
import { useB2BAgentAuth } from '@/hooks/use-b2b-agent-auth'

interface DynamicBrandProps {
  fallbackLogoUrl?: string | null | undefined
  fallbackDisplayName?: string | null | undefined
  isB2BMode?: boolean | undefined
}

function B2BBrandSuffix() {
  const { agent } = useB2BAgentAuth()
  if (!agent) return null
  const label = [agent.organizationName, agent.name].filter(Boolean).join(' / ')
  return (
    <span className="text-sm font-normal text-[var(--color-text-muted)]">
      for {label}
    </span>
  )
}

export function DynamicBrand({ fallbackLogoUrl, fallbackDisplayName, isB2BMode }: DynamicBrandProps) {
  const searchParams = useSearchParams()
  const hotelId = searchParams.get('hotelId') ? Number(searchParams.get('hotelId')) : null

  const { data: config } = useHotelConfig(hotelId)
  const { data: property } = useProperty(hotelId)

  const logoUrl = config?.logoUrl ?? fallbackLogoUrl
  const displayName = config?.displayName ?? property?.name ?? fallbackDisplayName
  const href = hotelId ? `/?hotelId=${hotelId}` : '/'

  return (
    <Link href={href} className="flex items-center gap-3">
      {logoUrl && (
        <Image
          src={logoUrl}
          alt={displayName ?? 'Hotel'}
          width={180}
          height={54}
          className="h-12 w-auto object-contain"
          unoptimized
        />
      )}
      <span className="text-lg font-semibold text-[var(--color-primary)]">
        {displayName ?? 'Hotel Booking'}
      </span>
      {isB2BMode && <B2BBrandSuffix />}
    </Link>
  )
}
