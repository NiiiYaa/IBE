'use client'

import type { OnsitePage } from '@ibe/shared'
import { OnsiteConversionOverlay } from './OnsiteConversionOverlay'

export function OnsiteConversionHomepage({ propertyId, page }: { propertyId: number; page: OnsitePage }) {
  return <OnsiteConversionOverlay propertyId={propertyId} page={page} />
}
