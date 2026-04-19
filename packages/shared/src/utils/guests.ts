/**
 * Utilities for building and parsing the HyperGuest guest/room string format.
 *
 * HyperGuest format: adults[-childAge,childAge][.nextRoom...]
 * e.g. "2-11,12.2" = room1: 2 adults + children aged 11,12; room2: 2 adults
 */

import type { RoomOccupancy } from '../types/api.js'

/**
 * Converts an array of RoomOccupancy objects into the HyperGuest guests string format.
 */
export function toHyperGuestGuestsParam(rooms: RoomOccupancy[]): string {
  return rooms
    .map(({ adults, childAges }) => {
      if (!childAges || childAges.length === 0) return String(adults)
      return `${adults}-${childAges.join(',')}`
    })
    .join('.')
}

/**
 * Returns the total adult count across all rooms.
 */
export function totalAdults(rooms: RoomOccupancy[]): number {
  return rooms.reduce((sum, r) => sum + r.adults, 0)
}

/**
 * Returns the total children count across all rooms.
 */
export function totalChildren(rooms: RoomOccupancy[]): number {
  return rooms.reduce((sum, r) => sum + (r.childAges?.length ?? 0), 0)
}
