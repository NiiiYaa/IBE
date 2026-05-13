import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPage = { $$eval: vi.fn() }

vi.mock('../playwright-browser.service.js', () => ({
  withStealthPage: vi.fn(async (_url: string, fn: (page: unknown) => Promise<unknown>) => fn(mockPage)),
}))

import { withStealthPage } from '../playwright-browser.service.js'
import { deriveBookingLinkRegex } from '../external-ibe-scraper.service.js'
import { resolveExternalBookingUrl } from '../external-ibe-scraper.service.js'

beforeEach(() => {
  vi.clearAllMocks()
  // Reset withStealthPage to the default pass-through each test
  ;(withStealthPage as ReturnType<typeof vi.fn>).mockImplementation(
    async (_url: string, fn: (page: unknown) => Promise<unknown>) => fn(mockPage),
  )
})

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

describe('resolveExternalBookingUrl', () => {
  const baseOpts = {
    searchUrl:       'https://ext.com/search?hotel=4521&from=2024-06-01&to=2024-06-07',
    bookingTemplate: 'https://ext.com/solution/{solutionId}/guest?hotel={externalHotelId}&from={checkIn}&to={checkOut}',
    externalHotelId: '4521',
    checkIn:         '2024-06-01',
    checkOut:        '2024-06-07',
    adults:          2,
  }

  it('resolves solutionId from first matching link when no roomName hint', async () => {
    mockPage.$$eval.mockResolvedValue([
      { href: 'https://ext.com/solution/uuid-aaa/guest?hotel=4521', cardText: 'Standard Room' },
      { href: 'https://ext.com/solution/uuid-bbb/guest?hotel=4521', cardText: 'Deluxe Room' },
    ])

    const result = await resolveExternalBookingUrl(baseOpts)

    expect(result.fallback).toBe(false)
    expect(result.solutionId).toBe('uuid-aaa')
    expect(result.bookingUrl).toContain('/solution/uuid-aaa/guest')
    expect(result.bookingUrl).toContain('hotel=4521')
    expect(result.bookingUrl).toContain('from=2024-06-01')
  })

  it('picks the link whose cardText matches roomName hint', async () => {
    mockPage.$$eval.mockResolvedValue([
      { href: 'https://ext.com/solution/uuid-aaa/guest?hotel=4521', cardText: 'Standard Room from $100' },
      { href: 'https://ext.com/solution/uuid-bbb/guest?hotel=4521', cardText: 'Deluxe Suite from $250' },
    ])

    const result = await resolveExternalBookingUrl({ ...baseOpts, roomName: 'Deluxe Suite' })

    expect(result.solutionId).toBe('uuid-bbb')
    expect(result.fallback).toBe(false)
  })

  it('falls back to search URL when no links match the regex', async () => {
    mockPage.$$eval.mockResolvedValue([
      { href: 'https://ext.com/info/4521', cardText: 'Hotel info page' },
    ])

    const result = await resolveExternalBookingUrl(baseOpts)

    expect(result.fallback).toBe(true)
    expect(result.bookingUrl).toBe(baseOpts.searchUrl)
    expect(result.solutionId).toBeUndefined()
  })

  it('falls back to search URL when withStealthPage throws', async () => {
    ;(withStealthPage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Browser crash'))

    const result = await resolveExternalBookingUrl(baseOpts)

    expect(result.fallback).toBe(true)
    expect(result.bookingUrl).toBe(baseOpts.searchUrl)
  })

  it('skips scraping when template has no {solutionId} — builds URL directly', async () => {
    const result = await resolveExternalBookingUrl({
      ...baseOpts,
      bookingTemplate: 'https://ext.com/book?hotel={externalHotelId}&from={checkIn}&to={checkOut}',
    })

    expect(withStealthPage).not.toHaveBeenCalled()
    expect(result.fallback).toBe(false)
    expect(result.bookingUrl).toContain('hotel=4521')
    expect(result.bookingUrl).toContain('from=2024-06-01')
  })
})
