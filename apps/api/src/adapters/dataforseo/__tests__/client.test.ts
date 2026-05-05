import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { fetchHotelScore } from '../client.js'

const TEST_CID = '4172147798342520944'

beforeEach(() => { vi.clearAllMocks() })

describe('fetchHotelScore', () => {
  it('returns null when login/password not configured', async () => {
    const result = await fetchHotelScore(TEST_CID, undefined, undefined)
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns score and reviewCount on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [{
          status_code: 20000,
          result: [{
            items: [{
              type: 'hotel_info',
              title: 'Hotel Test',
              rating: { value: 4.5, votes_count: 1240 },
            }],
          }],
        }],
      }),
    })

    const result = await fetchHotelScore(TEST_CID, 'testlogin', 'testpassword')
    expect(result).toEqual({ score: 4.5, reviewCount: 1240 })
  })

  it('returns null when API returns no items', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [{ status_code: 20000, result: [{ items: [] }] }] }),
    })

    const result = await fetchHotelScore(TEST_CID, 'login', 'pass')
    expect(result).toBeNull()
  })

  it('returns null on HTTP error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
    const result = await fetchHotelScore(TEST_CID, 'login', 'pass')
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('network failure'))
    const result = await fetchHotelScore(TEST_CID, 'login', 'pass')
    expect(result).toBeNull()
  })
})
