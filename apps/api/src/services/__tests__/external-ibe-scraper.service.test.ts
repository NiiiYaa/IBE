import { describe, it, expect } from 'vitest'
import { deriveBookingLinkRegex } from '../external-ibe-scraper.service.js'

describe('deriveBookingLinkRegex', () => {
  it('returns null when bookingTemplate has no {solutionId}', () => {
    expect(deriveBookingLinkRegex(
      'https://ext.com/book?hotel={externalHotelId}&from={checkIn}',
    )).toBeNull()
  })

  it('extracts solutionId from path segment', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/solution/{solutionId}/guest?hotel={externalHotelId}&from={checkIn}',
    )!
    expect(regex).not.toBeNull()
    const match = regex.exec(
      'https://ext.com/solution/88980bd0-1234-5678-abcd-ef0123456789/guest?hotel=4521&from=2024-06-01',
    )
    expect(match?.[1]).toBe('88980bd0-1234-5678-abcd-ef0123456789')
  })

  it('extracts solutionId from query string', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/book?token={solutionId}&hotel={externalHotelId}',
    )!
    const match = regex.exec('https://ext.com/book?token=abc-123&hotel=4521')
    expect(match?.[1]).toBe('abc-123')
  })

  it('does not match a URL whose domain differs from the template', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/solution/{solutionId}/guest',
    )!
    expect(regex.exec('https://other.com/solution/uuid/guest')).toBeNull()
  })

  it('handles {solutionId} immediately after domain slash', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/{solutionId}?hotel={externalHotelId}',
    )!
    const match = regex.exec('https://ext.com/my-session-token?hotel=99')
    expect(match?.[1]).toBe('my-session-token')
  })

  it('replaces other tokens in the prefix with non-capturing wildcard', () => {
    const regex = deriveBookingLinkRegex(
      'https://ext.com/{externalHotelId}/solution/{solutionId}/guest',
    )!
    const match = regex.exec('https://ext.com/4521/solution/uuid-aaa/guest')
    expect(match?.[1]).toBe('uuid-aaa')
  })
})
