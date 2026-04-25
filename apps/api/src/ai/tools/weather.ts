import { fetchPropertyStatic } from '../../adapters/hyperguest/static.js'
import { getResolvedWeatherConfig } from '../../services/weather-config.service.js'
import { logger } from '../../utils/logger.js'
import type { ToolDefinition } from '../adapters/types.js'

export const getWeatherForecastTool: ToolDefinition = {
  name: 'get_weather_forecast',
  description: 'Get weather data for the hotel location for specific dates. Automatically uses a live forecast if the dates are within the next 16 days, or historical archive data for dates further in the future or in the past. Call this when the user asks about weather, temperature, rain, what to pack, or weather during their stay. Always use the "message" field from the result as your opening sentence before presenting the weather data.',
  parameters: {
    type: 'object',
    properties: {
      propertyId: { type: 'number', description: 'Hotel property ID' },
      startDate: { type: 'string', description: 'Start date YYYY-MM-DD (use check-in date if known, otherwise today)' },
      endDate: { type: 'string', description: 'End date YYYY-MM-DD (use check-out date if known)' },
    },
    required: ['propertyId'],
  },
}

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

function describeCode(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? 'Unknown'
}

type DailyResponse = {
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_sum: number[]
    windspeed_10m_max: number[]
  }
}

async function fetchWeatherDays(
  lat: number, lng: number, startDate: string, endDate: string,
  tempUnit: string, endpoint: 'forecast' | 'archive'
): Promise<DailyResponse | null> {
  const base = endpoint === 'forecast'
    ? 'https://api.open-meteo.com/v1/forecast'
    : 'https://archive-api.open-meteo.com/v1/archive'
  const url = `${base}?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=auto&temperature_unit=${tempUnit}&start_date=${startDate}&end_date=${endDate}`
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json() as Promise<DailyResponse>
}

export async function executeGetWeatherForecast(args: Record<string, unknown>): Promise<unknown> {
  const propertyId = args.propertyId as number

  try {
    const [property, weatherCfg] = await Promise.all([
      fetchPropertyStatic(propertyId),
      getResolvedWeatherConfig(propertyId),
    ])

    const lat = property.coordinates?.latitude
    const lng = property.coordinates?.longitude
    if (!lat || !lng) return { error: 'Hotel coordinates not available.' }

    const today = new Date().toISOString().split('T')[0]!
    const forecastLimit = addDays(today, FORECAST_HORIZON_DAYS)

    const startDate = (args.startDate as string | undefined) ?? today
    const endDate = (args.endDate as string | undefined) ?? addDays(startDate, Math.min(weatherCfg.forecastDays - 1, 6))

    const tempUnit = weatherCfg.units === 'fahrenheit' ? 'fahrenheit' : 'celsius'
    const unitLabel = weatherCfg.units === 'fahrenheit' ? '°F' : '°C'

    // Determine source: use forecast if the entire range is within the 16-day window
    const useForecast = startDate >= today && endDate <= forecastLimit

    let fetchStart = startDate
    let fetchEnd = endDate
    let source: 'forecast' | 'historical'
    let historicalNote: string | null = null

    if (useForecast) {
      source = 'forecast'
    } else if (startDate > forecastLimit) {
      // Future dates beyond forecast horizon — use same dates from last year as reference
      source = 'historical'
      fetchStart = shiftYears(startDate, -1)
      fetchEnd = shiftYears(endDate, -1)
      historicalNote = `Based on data from ${fetchStart} to ${fetchEnd} (same period last year)`
    } else {
      // Past dates
      source = 'historical'
    }

    const endpoint = source === 'forecast' ? 'forecast' : 'archive'
    const data = await fetchWeatherDays(lat, lng, fetchStart, fetchEnd, tempUnit, endpoint)
    if (!data) return { error: 'Weather service unavailable. Please try again.' }

    const forecast = data.daily.time.map((date, i) => ({
      date: source === 'historical' && historicalNote ? shiftYears(date, 1) : date,
      description: describeCode(data.daily.weather_code[i]!),
      tempMin: `${Math.round(data.daily.temperature_2m_min[i]!)}${unitLabel}`,
      tempMax: `${Math.round(data.daily.temperature_2m_max[i]!)}${unitLabel}`,
      precipitation: `${data.daily.precipitation_sum[i]!.toFixed(1)} mm`,
      wind: `${Math.round(data.daily.windspeed_10m_max[i]!)} km/h`,
    }))

    const message = source === 'forecast'
      ? 'Here is the latest weather forecast for your selected dates and location:'
      : 'Here is the historical weather data for your selected dates and location:'

    return {
      message,
      source,
      ...(historicalNote ? { note: historicalNote } : {}),
      propertyId,
      hotelName: property.name,
      city: property.location?.city?.name ?? null,
      country: property.location?.countryCode ?? null,
      units: weatherCfg.units,
      forecast,
    }
  } catch (err) {
    logger.warn({ propertyId, err }, '[AI Tool] get_weather_forecast failed')
    return { error: 'Could not retrieve weather data.' }
  }
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
