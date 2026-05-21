import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../ai-config.service.js', () => ({ resolveAIConfig: vi.fn() }))
vi.mock('../../adapters/hyperguest/static.js', () => ({ fetchPropertyStatic: vi.fn() }))
vi.mock('../../ai/adapters/index.js', () => ({ getProviderAdapter: vi.fn() }))
vi.mock('../event-calendar.service.js', () => ({
  getSystemEventCalendarConfig: vi.fn(),
  getPropertyEventCalendarConfig: vi.fn(),
  replacePropertyEvents: vi.fn(),
}))
import { resolveAIConfig } from '../ai-config.service.js'
import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { getProviderAdapter } from '../../ai/adapters/index.js'
import {
  getSystemEventCalendarConfig,
  getPropertyEventCalendarConfig,
  replacePropertyEvents,
} from '../event-calendar.service.js'
import { refreshPropertyEvents } from '../event-calendar-fetch.service.js'

const mAI = resolveAIConfig as any
const mStatic = fetchPropertyStatic as any
const mAdapter = getProviderAdapter as any
const mSysConfig = getSystemEventCalendarConfig as any
const mPropConfig = getPropertyEventCalendarConfig as any
const mReplace = replacePropertyEvents as any

beforeEach(() => { vi.clearAllMocks() })

function makeStaticResult() {
  return {
    coordinates: { latitude: 51.5, longitude: -0.1 },
    location: { city: { id: 1, name: 'London' }, countryCode: 'GB', address: '1 St', postcode: 'SW1' },
  }
}

function makeAIConfig() {
  return {
    provider: 'openai' as const,
    model: 'gpt-4o',
    apiKey: 'sk-test',
    whatsappModel: null, whatsappProvider: null, whatsappApiKey: null,
    systemPrompt: null, source: 'org' as const,
  }
}

describe('refreshPropertyEvents', () => {
  it('returns early when no AI config is set', async () => {
    mAI.mockResolvedValue(null)
    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')
    expect(mReplace).not.toHaveBeenCalled()
  })

  it('returns early when fetchPropertyStatic fails', async () => {
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockRejectedValue(new Error('static fetch failed'))
    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')
    expect(mReplace).not.toHaveBeenCalled()
  })

  it('calls AI adapter with correct prompt containing city and radius', async () => {
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const mockCall = vi.fn().mockResolvedValue({ text: '[]', stopReason: 'end' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    expect(mockCall).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: expect.stringContaining('London') }),
      ]),
      [],
      expect.stringContaining('JSON'),
      'sk-test',
      'gpt-4o',
    )
  })

  it('uses property radius override when set', async () => {
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue({ propertyId: 1, radiusKm: 20 })
    const mockCall = vi.fn().mockResolvedValue({ text: '[]', stopReason: 'end' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    const callArgs = mockCall.mock.calls[0]
    const userMessage = callArgs[0][0].content as string
    expect(userMessage).toContain('20km')
  })

  it('stores parsed events on successful AI response', async () => {
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const events = [
      { name: 'Jazz Fest', startDate: '2026-06-10', endDate: '2026-06-12',
        description: 'Big event', demandLevel: 'high', demandDescription: 'High demand' },
    ]
    const mockCall = vi.fn().mockResolvedValue({
      text: JSON.stringify(events), stopReason: 'end',
    })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    expect(mReplace).toHaveBeenCalledWith(
      1,
      expect.any(Date),
      '2026-06-01',
      '2026-06-30',
      expect.arrayContaining([expect.objectContaining({ name: 'Jazz Fest' })]),
    )
  })

  it('stores zero events and does not crash on malformed AI response', async () => {
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const mockCall = vi.fn().mockResolvedValue({ text: 'not json!!', stopReason: 'end' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    expect(mReplace).toHaveBeenCalledWith(1, expect.any(Date), '2026-06-01', '2026-06-30', [])
  })

  it('stores zero events when AI response has error stopReason', async () => {
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const mockCall = vi.fn().mockResolvedValue({ text: null, stopReason: 'error' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    expect(mReplace).toHaveBeenCalledWith(1, expect.any(Date), '2026-06-01', '2026-06-30', [])
  })

  it('skips malformed event objects but saves valid ones', async () => {
    mAI.mockResolvedValue(makeAIConfig())
    mStatic.mockResolvedValue(makeStaticResult())
    mSysConfig.mockResolvedValue({ enabled: true, defaultRadiusKm: 50, cronSchedule: '0 4 * * *' })
    mPropConfig.mockResolvedValue(null)
    const mixed = [
      { name: 'Good', startDate: '2026-06-01', endDate: '2026-06-01',
        description: 'ok', demandLevel: 'low', demandDescription: 'low demand' },
      { name: 'Bad date', startDate: 'tomorrow', endDate: '2026-06-02',
        description: 'ok', demandLevel: 'low', demandDescription: 'low demand' },
      { name: '', startDate: '2026-06-01', endDate: '2026-06-01',
        description: 'ok', demandLevel: 'low', demandDescription: 'low demand' }, // empty name
      { name: 'Missing fields', startDate: '2026-06-02' }, // missing required fields
    ]
    const mockCall = vi.fn().mockResolvedValue({ text: JSON.stringify(mixed), stopReason: 'end' })
    mAdapter.mockReturnValue({ call: mockCall })
    mReplace.mockResolvedValue(undefined)

    await refreshPropertyEvents(1, '2026-06-01', '2026-06-30')

    const savedEvents = mReplace.mock.calls[0][4]
    expect(savedEvents).toHaveLength(1)
    expect(savedEvents[0].name).toBe('Good')
  })
})
