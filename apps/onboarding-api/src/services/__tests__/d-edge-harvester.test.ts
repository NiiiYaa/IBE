import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../env.js', () => ({ env: { RESIDENTIAL_PROXY_URL: undefined } }))

const mockLaunch = vi.hoisted(() => vi.fn())
vi.mock('playwright-extra', () => ({ chromium: { use: vi.fn(), launch: mockLaunch } }))
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: vi.fn(() => ({})) }))

vi.mock('playwright', () => ({
  chromium: {
    connectOverCDP: vi.fn().mockRejectedValue(new Error('CDP not available')),
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        addInitScript: vi.fn(),
        addCookies: vi.fn(),
        newPage: vi.fn().mockResolvedValue({
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue(null),
          waitForLoadState: vi.fn().mockResolvedValue(null),
          waitForTimeout: vi.fn().mockResolvedValue(null),
          evaluate: vi.fn().mockResolvedValue({ images: [] }),
        }),
      }),
      close: vi.fn(),
    }),
  },
}))

vi.mock('@ibe/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ibe/shared')>()
  return { ...actual, detectKnownIBE: vi.fn(), tryParsePropertyInfo: vi.fn().mockReturnValue(null), tryParseRooms: vi.fn().mockReturnValue([]) }
})

vi.mock('../tax-lookup.service.js', () => ({ lookupTaxes: vi.fn().mockReturnValue([]) }))

import { detectKnownIBE } from '@ibe/shared'
import { DEdgeHarvester } from '../harvesters/d-edge-harvester.js'

const MOCK_DETECTION = {
  name: 'D-Edge / Availpro', externalHotelId: '600',
  searchTemplate: 'https://www.secure-hotel-booking.com/d-edge/SLUG/24N2/RoomSelection?arrivalDate={checkIn}',
  bookingTemplate: 'https://www.secure-hotel-booking.com/d-edge/SLUG/24N2/RoomSelection?arrivalDate={checkIn}',
}

beforeEach(() => vi.clearAllMocks())

describe('DEdgeHarvester', () => {
  it('throws for unrecognised URL', async () => {
    vi.mocked(detectKnownIBE).mockReturnValue(null)
    await expect(new DEdgeHarvester().harvest('https://example.com', { checkIn: '2026-08-01', checkOut: '2026-08-02' }, () => {}))
      .rejects.toThrow('Not a recognised D-Edge')
  })

  it('launches browser and returns empty rooms when page blocked', async () => {
    vi.mocked(detectKnownIBE).mockReturnValue(MOCK_DETECTION)
    const mockPage = {
      on: vi.fn(),
      goto: vi.fn().mockResolvedValue(null),
      waitForLoadState: vi.fn().mockResolvedValue(null),
      waitForTimeout: vi.fn().mockResolvedValue(null),
      title: vi.fn().mockResolvedValue('Test Hotel'),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ images: [] })  // hotel info DOM call
        .mockResolvedValueOnce(null)             // ratesUrl evaluate
        .mockResolvedValue([]),                  // room searches — no rooms found
    }
    mockLaunch.mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        addInitScript: vi.fn(),
        addCookies: vi.fn(),
        newPage: vi.fn().mockResolvedValue(mockPage),
      }),
      close: vi.fn(),
    } as any)

    const result = await new DEdgeHarvester().harvest(
      'https://www.secure-hotel-booking.com/EDOUARD-6-MONTPARNASSE-ST-GERMAIN-DES-PRES/24N2/',
      { checkIn: '2026-08-01', checkOut: '2026-08-02' },
      () => {},
    )
    expect(result.rooms).toHaveLength(0)
    expect(mockLaunch).toHaveBeenCalledOnce()
  })
})
