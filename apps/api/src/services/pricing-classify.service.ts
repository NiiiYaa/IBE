import { prisma } from '../db/client.js'
import { resolveEffectivePricingConfig } from './pricing-config.service.js'

interface RateRow {
  date: string
  minSellPrice: number
  available: boolean
}

export async function classifyDailyRates(propertyId: number): Promise<void> {
  const config = await resolveEffectivePricingConfig(propertyId)
  const rates = await prisma.dailyRate.findMany({
    where: { propertyId },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, minSellPrice: true, available: true },
  })

  const rateRows: RateRow[] = rates.map(r => ({ date: r.date, minSellPrice: r.minSellPrice, available: r.available }))

  for (const rate of rates) {
    if (!rate.available) {
      await prisma.dailyRate.update({
        where: { id: rate.id },
        data: { calendarColor: 'normal', anomalyType: null, rollingAvg: null },
      })
      continue
    }

    const rollingAvg = computeRollingAvg(rate.date, rateRows)
    const calendarColor = assignCalendarColor(rate.minSellPrice, rollingAvg, config.highPricePct, config.lowPricePct)
    const anomalyType = assignAnomalyType(
      rate.date, rate.minSellPrice, rollingAvg, rateRows,
      config.highAnomalyPct, config.lowAnomalyPct, config.dayDifferencePct, config.dayDifferenceWindow,
    )

    await prisma.dailyRate.update({
      where: { id: rate.id },
      data: { calendarColor, anomalyType, rollingAvg },
    })
  }
}

export function computeRollingAvg(date: string, allRates: RateRow[]): number {
  const target = new Date(date + 'T00:00:00Z')
  const targetDay = target.getUTCDay()

  const window = allRates.filter(r => {
    if (!r.available || r.date === date) return false
    const d = new Date(r.date + 'T00:00:00Z')
    if (d.getUTCDay() !== targetDay) return false
    const diffDays = Math.abs((d.getTime() - target.getTime()) / 86_400_000)
    return diffDays <= 28
  })

  if (window.length === 0) return allRates.find(r => r.date === date)?.minSellPrice ?? 0
  return window.reduce((sum, r) => sum + r.minSellPrice, 0) / window.length
}

export function assignCalendarColor(
  price: number,
  avg: number,
  highPricePct: number,
  lowPricePct: number,
): 'low' | 'normal' | 'high' {
  if (avg === 0) return 'normal'
  const ratio = price / avg
  if (ratio > 1 + highPricePct / 100) return 'high'
  if (ratio < 1 - lowPricePct / 100) return 'low'
  return 'normal'
}

export function assignAnomalyType(
  date: string,
  price: number,
  rollingAvg: number,
  allRates: RateRow[],
  highAnomalyPct: number,
  lowAnomalyPct: number,
  dayDifferencePct: number,
  dayDifferenceWindow: number,
): 'high' | 'low' | 'diff' | null {
  if (rollingAvg > 0) {
    const ratio = price / rollingAvg
    if (ratio > 1 + highAnomalyPct / 100) return 'high'
  }

  const sorted = [...allRates].sort((a, b) => a.date.localeCompare(b.date))
  const idx = sorted.findIndex(r => r.date === date)
  if (idx > 0) {
    const prevDays = sorted.slice(Math.max(0, idx - dayDifferenceWindow), idx).filter(r => r.available)
    if (prevDays.length > 0) {
      const prevAvg = prevDays.reduce((sum, r) => sum + r.minSellPrice, 0) / prevDays.length
      if (prevAvg > 0 && (prevAvg - price) / prevAvg > dayDifferencePct / 100) return 'diff'
    }
  }

  if (rollingAvg > 0) {
    const ratio = price / rollingAvg
    if (ratio < 1 - lowAnomalyPct / 100) return 'low'
  }

  return null
}
