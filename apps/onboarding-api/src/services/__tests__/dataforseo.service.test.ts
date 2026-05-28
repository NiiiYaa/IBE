import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('../../env.js', () => ({
  env: {
    DATAFORSEO_LOGIN: 'testlogin',
    DATAFORSEO_PASSWORD: 'testpassword',
  },
}))

const { searchHotelsDataForSEO } = await import('../dataforseo.service.js')

describe('searchHotelsDataForSEO', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('returns scored HotelCandidate[] from organic items', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tasks: [{
          status_code: 20000,
          result: [{
            items: [
              { type: 'organic', url: 'https://www.h10hotels.com', title: 'H10 Hotels', description: 'Official site' },
              { type: 'paid', url: 'https://www.booking.com/h10', title: 'Booking', description: '' },
              { type: 'organic', url: 'https://booking.com/h10barcelona', title: 'Booking H10', description: '' },
            ],
          }],
        }],
      }),
    } as any)

    const results = await searchHotelsDataForSEO('H10 Barcelona', 'Barcelona', 'Spain')

    // Only organic items, OTAs filtered out
    expect(results.length).toBe(1)
    expect(results[0].url).toBe('https://www.h10hotels.com')
    expect(results[0].title).toBe('H10 Hotels')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('returns [] on non-20000 task status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: [{ status_code: 40000, result: [] }] }),
    } as any)

    const results = await searchHotelsDataForSEO('Test Hotel', '', '')
    expect(results).toEqual([])
  })

  it('returns [] on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const results = await searchHotelsDataForSEO('Test Hotel', '', '')
    expect(results).toEqual([])
  })

  it('sends correct query with site exclusions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: [{ status_code: 20000, result: [{ items: [] }] }] }),
    } as any)

    await searchHotelsDataForSEO('Grand Hotel', 'Rome', 'Italy')

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.dataforseo.com/v3/serp/google/organic/live/regular')
    const body = JSON.parse(options.body as string)
    expect(body[0].keyword).toContain('"Grand Hotel"')
    expect(body[0].keyword).toContain('Rome')
    expect(body[0].keyword).toContain('-site:booking.com')
    expect(body[0].depth).toBe(10)
  })
})
