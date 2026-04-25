import { searchAvailabilityTool, executeSearchAvailability } from './search.js'
import { getPropertyInfoTool, executeGetPropertyInfo } from './property.js'
import { filterResultsTool, executeFilterResults } from './filter.js'
import { prepareBookingTool, executePrepareBooking } from './booking.js'
import { listPropertiesTool, executeListProperties } from './list-properties.js'
import { getNearbyPlacesTool, executeGetNearbyPlaces } from './nearby.js'
import { getWeatherForecastTool, executeGetWeatherForecast } from './weather.js'
import { getNearbyEventsTool, executeGetNearbyEvents } from './events.js'
import type { ToolDefinition } from '../adapters/types.js'

export const ALL_TOOLS: ToolDefinition[] = [
  listPropertiesTool,
  searchAvailabilityTool,
  getPropertyInfoTool,
  filterResultsTool,
  prepareBookingTool,
  getNearbyPlacesTool,
  getWeatherForecastTool,
  getNearbyEventsTool,
]

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_chain_hotels': return executeListProperties(args)
    case 'search_availability': return executeSearchAvailability(args)
    case 'get_property_info': return executeGetPropertyInfo(args)
    case 'filter_results': return executeFilterResults(args)
    case 'prepare_booking': return executePrepareBooking(args)
    case 'get_nearby_places': return executeGetNearbyPlaces(args)
    case 'get_weather_forecast': return executeGetWeatherForecast(args)
    case 'get_nearby_events': return executeGetNearbyEvents(args)
    default: return { error: `Unknown tool: ${name}` }
  }
}
