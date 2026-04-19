/**
 * Config utilities — shared between layout.tsx (server) and admin pages.
 * The actual CSS injection is done in layout.tsx via dangerouslySetInnerHTML
 * to avoid React hydration errors from HTML entity encoding.
 */

export type { HotelDesignConfig } from '@ibe/shared'
