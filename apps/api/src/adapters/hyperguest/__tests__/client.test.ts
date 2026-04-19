import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HyperGuestApiError } from '../client.js'

// Mock undici
vi.mock('undici', () => ({
  request: vi.fn(),
}))

// Mock env
vi.mock('../../../config/env.js', () => ({
  env: {
    HYPERGUEST_BEARER_TOKEN: 'test-token',
    HYPERGUEST_SEARCH_DOMAIN: 'search.example.com',
    HYPERGUEST_BOOKING_DOMAIN: 'booking.example.com',
    HYPERGUEST_STATIC_DOMAIN: 'static.example.com',
    NODE_ENV: 'test',
  },
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const mockText = (content: string) => ({ text: () => Promise.resolve(content) })

describe('HyperGuest HTTP client', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('hgGet', () => {
    it('returns parsed JSON on 200', async () => {
      const { request } = await import('undici')
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 200,
        body: mockText(JSON.stringify({ results: [] })),
      } as never)

      const { hgGet } = await import('../client.js')
      const result = await hgGet<{ results: unknown[] }>('https://example.com/test')
      expect(result).toEqual({ results: [] })
    })

    it('throws HyperGuestApiError on 400', async () => {
      const { request } = await import('undici')
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 400,
        body: mockText(
          JSON.stringify({
            error: 'Validation Error',
            errorCode: 'SN.400',
            errorDetails: [{ message: 'Invalid checkIn', field: 'checkIn' }],
          }),
        ),
      } as never)

      const { hgGet } = await import('../client.js')
      await expect(hgGet('https://example.com/test')).rejects.toThrow(HyperGuestApiError)
    })

    it('throws HyperGuestApiError on 401 with correct errorCode', async () => {
      const { request } = await import('undici')
      vi.mocked(request).mockResolvedValueOnce({
        statusCode: 401,
        body: mockText(JSON.stringify({ error: 'Unauthorized', errorCode: 'SN.401' })),
      } as never)

      const { hgGet } = await import('../client.js')
      const err = await hgGet('https://example.com/test').catch((e) => e)
      expect(err).toBeInstanceOf(HyperGuestApiError)
      expect((err as HyperGuestApiError).errorCode).toBe('SN.401')
      expect((err as HyperGuestApiError).httpStatus).toBe(401)
    })
  })
})
