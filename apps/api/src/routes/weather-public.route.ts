import type { FastifyInstance } from 'fastify'
import { fetchPropertyStatic } from '../adapters/hyperguest/static.js'
import { getResolvedWeatherConfig } from '../services/weather-config.service.js'

const FORECAST_HORIZON_DAYS = 16

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Heavy thunderstorm with hail',
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}

function shiftYears(date: string, years: number): string {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]!
}

type DailyResponse = {
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_sum: number[]
  }
}

async function fetchDays(lat: number, lng: number, start: string, end: string, tempUnit: string, archive: boolean): Promise<DailyResponse | null> {
  const base = archive ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast'
  const url = `${base}?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&temperature_unit=${tempUnit}&start_date=${start}&end_date=${end}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.json() as Promise<DailyResponse>
  } catch { return null }
}

export async function weatherPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/weather', async (request, reply) => {
    const qs = request.query as Record<string, string>
    const propertyId = qs.propertyId ? parseInt(qs.propertyId, 10) : null
    if (!propertyId || isNaN(propertyId)) return reply.status(400).send({ error: 'propertyId required' })
    const fallbackOrgId = qs.orgId ? parseInt(qs.orgId, 10) : undefined

    const today = new Date().toISOString().split('T')[0]!
    const startDate = qs.startDate ?? today
    const endDate = qs.endDate ?? addDays(startDate, 6)

    const [propertyResult, cfg] = await Promise.all([
      fetchPropertyStatic(propertyId).catch(() => null),
      getResolvedWeatherConfig(propertyId, fallbackOrgId),
    ])

    if (!cfg.enabled) return reply.send({ enabled: false })

    const lat = propertyResult?.coordinates?.latitude
    const lng = propertyResult?.coordinates?.longitude
    if (!lat || !lng) return reply.send({ enabled: false })

    const forecastLimit = addDays(today, FORECAST_HORIZON_DAYS)
    const useForecast = startDate >= today && endDate <= forecastLimit

    const tempUnit = cfg.units === 'fahrenheit' ? 'fahrenheit' : 'celsius'
    const unitLabel = cfg.units === 'fahrenheit' ? '°F' : '°C'

    let fetchStart = startDate
    let fetchEnd = endDate
    let source: 'forecast' | 'historical'

    if (useForecast) {
      source = 'forecast'
    } else if (startDate > forecastLimit) {
      source = 'historical'
      fetchStart = shiftYears(startDate, -1)
      fetchEnd = shiftYears(endDate, -1)
    } else {
      source = 'historical'
    }

    const data = await fetchDays(lat, lng, fetchStart, fetchEnd, tempUnit, source === 'historical')
    if (!data) return reply.send({ enabled: false })

    const forecast = data.daily.time.map((date, i) => ({
      date: source === 'historical' && startDate > forecastLimit ? shiftYears(date, 1) : date,
      weatherCode: data.daily.weather_code[i]!,
      description: WMO_DESCRIPTIONS[data.daily.weather_code[i]!] ?? 'Unknown',
      tempMin: Math.round(data.daily.temperature_2m_min[i]!),
      tempMax: Math.round(data.daily.temperature_2m_max[i]!),
      precipitation: parseFloat(data.daily.precipitation_sum[i]!.toFixed(1)),
    }))

    const message = source === 'forecast'
      ? 'Here is the latest weather forecast for your selected dates and location:'
      : 'Here is the historical weather data for your selected dates and location:'

    return reply.send({ enabled: true, source, message, units: cfg.units, unitLabel, forecast, stripDefaultFolded: cfg.stripDefaultFolded, stripAutoFoldSecs: cfg.stripAutoFoldSecs })
  })
}
