import { describe, it, expect } from 'vitest'

// Test the pure classification functions in isolation
// Import them after they exist
describe('assignCalendarColor', () => {
  it('returns normal when price is within threshold', async () => {
    const { assignCalendarColor } = await import('../pricing-classify.service.js')
    expect(assignCalendarColor(100, 100, 15, 15)).toBe('normal')
    expect(assignCalendarColor(114, 100, 15, 15)).toBe('normal') // 14% above, threshold is 15
  })

  it('returns high when price exceeds threshold', async () => {
    const { assignCalendarColor } = await import('../pricing-classify.service.js')
    expect(assignCalendarColor(120, 100, 15, 15)).toBe('high') // 20% above, threshold is 15
  })

  it('returns low when price is below threshold', async () => {
    const { assignCalendarColor } = await import('../pricing-classify.service.js')
    expect(assignCalendarColor(80, 100, 15, 15)).toBe('low') // 20% below, threshold is 15
  })

  it('returns normal when avg is 0', async () => {
    const { assignCalendarColor } = await import('../pricing-classify.service.js')
    expect(assignCalendarColor(100, 0, 15, 15)).toBe('normal')
  })
})

describe('computeRollingAvg', () => {
  it('returns avg of same-weekday prices within ±28 days', async () => {
    const { computeRollingAvg } = await import('../pricing-classify.service.js')
    // 2026-05-22 is a Friday (day 5)
    const rates = [
      { date: '2026-05-15', minSellPrice: 100, available: true }, // Friday -7 days
      { date: '2026-05-22', minSellPrice: 200, available: true }, // Friday target
      { date: '2026-05-29', minSellPrice: 150, available: true }, // Friday +7 days
      { date: '2026-05-23', minSellPrice: 999, available: true }, // Saturday — excluded
    ]
    // For 2026-05-22, window includes 2026-05-15 and 2026-05-29 (not the target itself)
    const avg = computeRollingAvg('2026-05-22', rates)
    expect(avg).toBeCloseTo(125) // (100 + 150) / 2
  })

  it('excludes unavailable days from the average', async () => {
    const { computeRollingAvg } = await import('../pricing-classify.service.js')
    const rates = [
      { date: '2026-05-15', minSellPrice: 100, available: false }, // unavailable Friday
      { date: '2026-05-22', minSellPrice: 200, available: true },  // target
      { date: '2026-05-29', minSellPrice: 150, available: true },  // Friday +7
    ]
    const avg = computeRollingAvg('2026-05-22', rates)
    expect(avg).toBeCloseTo(150) // only 2026-05-29 counts
  })
})

describe('assignAnomalyType', () => {
  it('returns high when price far above rolling avg', async () => {
    const { assignAnomalyType } = await import('../pricing-classify.service.js')
    const rates = [{ date: '2026-05-22', minSellPrice: 200, available: true }]
    // price=200, rollingAvg=100, highAnomalyPct=30 → 100% above → high
    expect(assignAnomalyType('2026-05-22', 200, 100, rates, 30, 30, 35, 7)).toBe('high')
  })

  it('returns diff when price drops vs previous days', async () => {
    const { assignAnomalyType } = await import('../pricing-classify.service.js')
    const rates = [
      { date: '2026-05-15', minSellPrice: 200, available: true },
      { date: '2026-05-16', minSellPrice: 200, available: true },
      { date: '2026-05-17', minSellPrice: 200, available: true },
      { date: '2026-05-18', minSellPrice: 200, available: true },
      { date: '2026-05-19', minSellPrice: 200, available: true },
      { date: '2026-05-20', minSellPrice: 200, available: true },
      { date: '2026-05-21', minSellPrice: 200, available: true },
      { date: '2026-05-22', minSellPrice: 100, available: true }, // 50% drop vs prev 7 days avg of 200
    ]
    // 50% drop > 35% threshold → diff
    expect(assignAnomalyType('2026-05-22', 100, 200, rates, 30, 30, 35, 7)).toBe('diff')
  })

  it('returns null when no anomaly', async () => {
    const { assignAnomalyType } = await import('../pricing-classify.service.js')
    const rates = [{ date: '2026-05-22', minSellPrice: 100, available: true }]
    expect(assignAnomalyType('2026-05-22', 100, 100, rates, 30, 30, 35, 7)).toBeNull()
  })
})
