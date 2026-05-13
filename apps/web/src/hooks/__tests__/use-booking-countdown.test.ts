import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBookingCountdown } from '../use-booking-countdown'

const DURATION_MS = 30 * 60 * 1000
const KEY = 'test-countdown'

beforeEach(() => {
  sessionStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBookingCountdown', () => {
  it('starts with timeLeftMs close to 30 minutes', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    expect(result.current.timeLeftMs).toBeGreaterThan(DURATION_MS - 2000)
    expect(result.current.timeLeftMs).toBeLessThanOrEqual(DURATION_MS)
  })

  it('is not expired initially', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    expect(result.current.isExpired).toBe(false)
  })

  it('decrements timeLeftMs over time', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current.timeLeftMs).toBeLessThanOrEqual(DURATION_MS - 60_000 + 1000)
  })

  it('isExpired becomes true after 30 minutes', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    act(() => { vi.advanceTimersByTime(DURATION_MS + 1000) })
    expect(result.current.isExpired).toBe(true)
    expect(result.current.timeLeftMs).toBe(0)
  })

  it('resumes from sessionStorage if a valid start time is stored', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    sessionStorage.setItem(KEY, String(fiveMinutesAgo))
    const { result } = renderHook(() => useBookingCountdown(KEY))
    expect(result.current.timeLeftMs).toBeLessThanOrEqual(25 * 60 * 1000 + 1000)
    expect(result.current.timeLeftMs).toBeGreaterThan(24 * 60 * 1000)
  })

  it('starts fresh when stored start time is expired', () => {
    const fortyMinutesAgo = Date.now() - 40 * 60 * 1000
    sessionStorage.setItem(KEY, String(fortyMinutesAgo))
    const { result } = renderHook(() => useBookingCountdown(KEY))
    expect(result.current.timeLeftMs).toBeGreaterThan(DURATION_MS - 2000)
  })

  it('reset() restores timeLeftMs to full duration', () => {
    const { result } = renderHook(() => useBookingCountdown(KEY))
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000) })
    expect(result.current.timeLeftMs).toBeLessThan(DURATION_MS)
    act(() => { result.current.reset() })
    expect(result.current.timeLeftMs).toBeGreaterThan(DURATION_MS - 2000)
  })
})
