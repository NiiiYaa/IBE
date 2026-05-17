export interface AmadeusConfigResponse {
  credentialsSet: boolean
  clientIdMasked: string | null      // first 8 chars + "…" — clientSecret never returned
  credentialsLocked: boolean          // parent level enforces its own credentials
  enabled: boolean
  enforceChildCreds: boolean          // this level locks credentials for levels below
  systemServiceDisabled: boolean
  hasOwnConfig: boolean
  tokenUrl: string                    // system level only; empty string at org/property level
  activitiesUrl: string               // system level only; empty string at org/property level
  radiusKm: number
  maxActivities: number
  stripLabel: string
  stripMode: 'merged' | 'separate'
  stripDefaultFolded: boolean
  stripAutoFoldSecs: number
  showBookButton: boolean
}

export interface AmadeusConfigUpdate {
  clientId?: string
  clientSecret?: string
  clearCredentials?: boolean
  enabled?: boolean
  enforceChildCreds?: boolean
  systemServiceDisabled?: boolean
  tokenUrl?: string                   // system level only
  activitiesUrl?: string              // system level only
  radiusKm?: number
  maxActivities?: number
  stripLabel?: string
  stripMode?: 'merged' | 'separate'
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
  showBookButton?: boolean
  // property-level nullable overrides (null = reset to inherited)
  radiusKmOverride?: number | null
  maxActivitiesOverride?: number | null
  stripLabelOverride?: string | null
  stripModeOverride?: string | null
}

export interface AmadeusActivity {
  id: string
  name: string
  description: string | null
  category: string | null
  thumb: string | null
  price: number | null
  currency: string | null
  duration: string | null
  bookable: boolean
  bookingUrl: string | null
}

export interface AmadeusPublicResponse {
  enabled: boolean
  radiusKm?: number
  activities?: AmadeusActivity[]
  stripLabel?: string
  stripMode?: 'merged' | 'separate'
  stripDefaultFolded?: boolean
  stripAutoFoldSecs?: number
  showBookButton?: boolean
}

export interface ActivitiesAndEventsResponse {
  ticketmaster: {
    enabled: boolean
    events?: Array<{
      name: string
      date: string | null
      time: string | null
      category: string | null
      genre: string | null
      venue: string | null
      city: string | null
      ticketUrl: string | null
      thumb: string | null
    }>
    stripDefaultFolded?: boolean
    stripAutoFoldSecs?: number
    showBookButton?: boolean
  }
  amadeus: AmadeusPublicResponse
}
