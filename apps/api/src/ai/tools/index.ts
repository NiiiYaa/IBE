import { searchAvailabilityTool, executeSearchAvailability } from './search.js'
import { getPropertyInfoTool, executeGetPropertyInfo } from './property.js'
import { filterResultsTool, executeFilterResults } from './filter.js'
import { prepareBookingTool, executePrepareBooking } from './booking.js'
import type { ToolDefinition } from '../adapters/types.js'

export const ALL_TOOLS: ToolDefinition[] = [
  searchAvailabilityTool,
  getPropertyInfoTool,
  filterResultsTool,
  prepareBookingTool,
]

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_availability': return executeSearchAvailability(args)
    case 'get_property_info': return executeGetPropertyInfo(args)
    case 'filter_results': return executeFilterResults(args)
    case 'prepare_booking': return executePrepareBooking(args)
    default: return { error: `Unknown tool: ${name}` }
  }
}
