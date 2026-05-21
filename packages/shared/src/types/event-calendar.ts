export interface SystemEventCalendarConfig {
  enabled: boolean
  defaultRadiusKm: number
  cronSchedule: string
}

export interface PropertyEventCalendarConfig {
  propertyId: number
  radiusKm: number | null
}

export interface EventCalendarEvent {
  id: number
  propertyId: number
  fetchedAt: string
  periodStart: string
  periodEnd: string
  name: string
  startDate: string
  endDate: string
  description: string
  demandLevel: 'high' | 'medium' | 'low'
  demandDescription: string
}

export interface EventCalendarRunResponse {
  started: boolean
}

export interface ChainEventCalendarEvents {
  propertyId: number
  events: EventCalendarEvent[]
}
