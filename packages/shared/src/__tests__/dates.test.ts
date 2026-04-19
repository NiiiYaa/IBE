import { describe, it, expect } from 'vitest'
import {
  nightsBetween,
  calculateCancellationDeadline,
  addDays,
  todayIso,
} from '../utils/dates.js'

describe('nightsBetween', () => {
  it('returns 1 for consecutive dates', () => {
    expect(nightsBetween('2024-06-01', '2024-06-02')).toBe(1)
  })

  it('returns 7 for a week', () => {
    expect(nightsBetween('2024-06-01', '2024-06-08')).toBe(7)
  })

  it('returns 0 for same date', () => {
    expect(nightsBetween('2024-06-01', '2024-06-01')).toBe(0)
  })
})

describe('calculateCancellationDeadline', () => {
  it('subtracts hours correctly', () => {
    // checkIn = 2024-06-10, deadline hour = 10:00, offset = 12 hours
    // pivot = 2024-06-10 10:00 - 12h = 2024-06-09 22:00
    const result = calculateCancellationDeadline('2024-06-10', 12, 'hours', '10:00')
    expect(result).toBe('2024-06-09T22:00:00')
  })

  it('subtracts days correctly', () => {
    // checkIn = 2024-06-10, deadline hour = 00:00, offset = 3 days
    // pivot = 2024-06-10 00:00 - 3d = 2024-06-07 00:00
    const result = calculateCancellationDeadline('2024-06-10', 3, 'days', '00:00')
    expect(result).toBe('2024-06-07T00:00:00')
  })

  it('handles midnight boundary correctly', () => {
    const result = calculateCancellationDeadline('2024-06-10', 24, 'hours', '00:00')
    expect(result).toBe('2024-06-09T00:00:00')
  })
})

describe('addDays', () => {
  it('adds days correctly', () => {
    expect(addDays('2024-06-01', 7)).toBe('2024-06-08')
  })

  it('handles month rollover', () => {
    expect(addDays('2024-06-30', 1)).toBe('2024-07-01')
  })

  it('handles year rollover', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01')
  })
})

describe('todayIso', () => {
  it('returns a valid YYYY-MM-DD string', () => {
    const today = todayIso()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
