import { prisma } from '../db/client.js'
import type { SellModel } from './org.service.js'

export interface AIChannelSettings {
  aiSearchBar: SellModel[]
  whatsapp: SellModel[]
  mcp: SellModel[]
}

export type UpdateAIChannelSettingsRequest = Partial<AIChannelSettings>

function parseModels(raw: string | null | undefined): SellModel[] {
  if (raw === null || raw === undefined) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as SellModel[]
  } catch { /* fall through */ }
  return []
}

const DEFAULT_SETTINGS: AIChannelSettings = {
  aiSearchBar: ['b2c', 'b2b'],
  whatsapp: [],
  mcp: [],
}

function rowToSettings(row: {
  aiSearchBarModels: string
  whatsappModels: string
  mcpModels: string
} | null): AIChannelSettings {
  if (!row) return DEFAULT_SETTINGS
  return {
    aiSearchBar: parseModels(row.aiSearchBarModels),
    whatsapp: parseModels(row.whatsappModels),
    mcp: parseModels(row.mcpModels),
  }
}

export async function getOrgAIChannels(organizationId: number): Promise<AIChannelSettings> {
  const row = await prisma.orgAIChannels.findUnique({ where: { organizationId } })
  return rowToSettings(row)
}

export async function upsertOrgAIChannels(
  organizationId: number,
  data: UpdateAIChannelSettingsRequest,
): Promise<AIChannelSettings> {
  const dbData: Record<string, string> = {}
  if (data.aiSearchBar !== undefined) dbData['aiSearchBarModels'] = JSON.stringify(data.aiSearchBar)
  if (data.whatsapp !== undefined) dbData['whatsappModels'] = JSON.stringify(data.whatsapp)
  if (data.mcp !== undefined) dbData['mcpModels'] = JSON.stringify(data.mcp)

  const row = await prisma.orgAIChannels.upsert({
    where: { organizationId },
    create: { organizationId, ...dbData },
    update: dbData,
  })
  return rowToSettings(row)
}
