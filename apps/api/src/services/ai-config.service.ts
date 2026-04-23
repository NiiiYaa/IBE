import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import type { AIProvider, AIConfigResponse, OrgAIConfigResponse, PropertyAIConfigResponse, AIConfigUpdate, OrgAIConfigUpdate, PropertyAIConfigUpdate } from '@ibe/shared'

function getEncryptionKey(): Buffer {
  if (!env.AI_CONFIG_ENCRYPTION_KEY) {
    logger.warn('[AIConfig] AI_CONFIG_ENCRYPTION_KEY not set — API keys stored unencrypted')
    return Buffer.alloc(32, 0)
  }
  return createHash('sha256').update(env.AI_CONFIG_ENCRYPTION_KEY).digest()
}

export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptApiKey(stored: string): string {
  try {
    const colonIdx = stored.indexOf(':')
    if (colonIdx !== 32) return stored // not encrypted (plain text legacy or no-key mode)
    const ivHex = stored.slice(0, 32)
    const encHex = stored.slice(33)
    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const enc = Buffer.from(encHex, 'hex')
    const decipher = createDecipheriv('aes-256-cbc', key, iv)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return stored
  }
}

function maskApiKey(stored: string): string {
  const plain = decryptApiKey(stored)
  if (plain.length <= 8) return '****'
  return `****${plain.slice(-4)}`
}

function rowToResponse(row: {
  provider: string | null
  model: string | null
  apiKey: string | null
  systemPrompt: string | null
  enabled: boolean
} | null): AIConfigResponse {
  return {
    provider: (row?.provider as AIProvider) ?? null,
    model: row?.model ?? null,
    apiKeySet: !!row?.apiKey,
    apiKeyMasked: row?.apiKey ? maskApiKey(row.apiKey) : null,
    systemPrompt: row?.systemPrompt ?? null,
    enabled: row?.enabled ?? false,
  }
}

// ── System level ──────────────────────────────────────────────────────────────

export async function getSystemAIConfig(): Promise<AIConfigResponse> {
  const row = await prisma.systemAIConfig.findFirst()
  return rowToResponse(row)
}

export async function upsertSystemAIConfig(data: AIConfigUpdate): Promise<AIConfigResponse> {
  const existing = await prisma.systemAIConfig.findFirst()
  const update: Record<string, unknown> = {}
  if (data.provider !== undefined) update.provider = data.provider
  if (data.model !== undefined) update.model = data.model
  if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt
  if (data.enabled !== undefined) update.enabled = data.enabled

  if (existing) {
    const row = await prisma.systemAIConfig.update({ where: { id: existing.id }, data: update })
    logger.info('[AIConfig] System AI config updated')
    return rowToResponse(row)
  }

  const row = await prisma.systemAIConfig.create({
    data: {
      provider: (data.provider ?? 'openai') as string,
      model: data.model ?? 'gpt-4o',
      apiKey: data.apiKey ? encryptApiKey(data.apiKey) : '',
      systemPrompt: data.systemPrompt ?? null,
      enabled: data.enabled ?? false,
    },
  })
  logger.info('[AIConfig] System AI config created')
  return rowToResponse(row)
}

// ── Org level ─────────────────────────────────────────────────────────────────

export async function getOrgAIConfig(organizationId: number): Promise<OrgAIConfigResponse> {
  const row = await prisma.orgAIConfig.findUnique({ where: { organizationId } })
  const systemRow = await prisma.systemAIConfig.findFirst()
  return {
    ...rowToResponse(row),
    useInherited: row?.useInherited ?? true,
    inherited: rowToResponse(systemRow),
  }
}

export async function upsertOrgAIConfig(organizationId: number, data: OrgAIConfigUpdate): Promise<OrgAIConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.useInherited !== undefined) update.useInherited = data.useInherited
  if (data.provider !== undefined) update.provider = data.provider
  if (data.model !== undefined) update.model = data.model
  if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt
  if (data.enabled !== undefined) update.enabled = data.enabled

  await prisma.orgAIConfig.upsert({
    where: { organizationId },
    create: { organizationId, useInherited: data.useInherited ?? true, ...update },
    update,
  })
  logger.info({ organizationId }, '[AIConfig] Org AI config updated')
  return getOrgAIConfig(organizationId)
}

// ── Property level ────────────────────────────────────────────────────────────

export async function getPropertyAIConfig(propertyId: number): Promise<PropertyAIConfigResponse> {
  const [row, property] = await Promise.all([
    prisma.propertyAIConfig.findUnique({ where: { propertyId } }),
    prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } }),
  ])

  const orgRow = property
    ? await prisma.orgAIConfig.findUnique({ where: { organizationId: property.organizationId } })
    : null
  const systemRow = await prisma.systemAIConfig.findFirst()

  // Resolve inherited source
  let inherited: AIConfigResponse | null = null
  let inheritedFrom: 'org' | 'system' | null = null

  if (orgRow && !orgRow.useInherited && orgRow.provider) {
    inherited = rowToResponse(orgRow)
    inheritedFrom = 'org'
  } else if (systemRow?.provider) {
    inherited = rowToResponse(systemRow)
    inheritedFrom = 'system'
  }

  return {
    ...rowToResponse(row),
    useInherited: row?.useInherited ?? true,
    inherited,
    inheritedFrom,
  }
}

export async function upsertPropertyAIConfig(propertyId: number, data: PropertyAIConfigUpdate): Promise<PropertyAIConfigResponse> {
  const update: Record<string, unknown> = {}
  if (data.useInherited !== undefined) update.useInherited = data.useInherited
  if (data.provider !== undefined) update.provider = data.provider
  if (data.model !== undefined) update.model = data.model
  if (data.apiKey !== undefined && data.apiKey !== '') update.apiKey = encryptApiKey(data.apiKey)
  if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt
  if (data.enabled !== undefined) update.enabled = data.enabled

  await prisma.propertyAIConfig.upsert({
    where: { propertyId },
    create: { propertyId, useInherited: data.useInherited ?? true, ...update },
    update,
  })
  logger.info({ propertyId }, '[AIConfig] Property AI config updated')
  return getPropertyAIConfig(propertyId)
}

// ── Resolution (for AI engine use) ───────────────────────────────────────────

export interface ResolvedAIConfig {
  provider: AIProvider
  model: string
  apiKey: string
  systemPrompt: string | null
  source: 'property' | 'org' | 'system'
}

export async function resolveAIConfig(propertyId?: number): Promise<ResolvedAIConfig | null> {
  if (propertyId) {
    const propRow = await prisma.propertyAIConfig.findUnique({ where: { propertyId } })
    const isFakeProp = propRow?.provider === 'fake'
    if (propRow && !propRow.useInherited && propRow.provider && (isFakeProp || propRow.apiKey) && propRow.enabled) {
      return {
        provider: propRow.provider as AIProvider,
        model: propRow.model!,
        apiKey: isFakeProp ? '' : decryptApiKey(propRow.apiKey!),
        systemPrompt: propRow.systemPrompt,
        source: 'property',
      }
    }
    // Fall through to org
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { organizationId: true } })
    if (property) {
      const orgRow = await prisma.orgAIConfig.findUnique({ where: { organizationId: property.organizationId } })
      const isFakeOrg = orgRow?.provider === 'fake'
      if (orgRow && !orgRow.useInherited && orgRow.provider && (isFakeOrg || orgRow.apiKey) && orgRow.enabled) {
        return {
          provider: orgRow.provider as AIProvider,
          model: orgRow.model!,
          apiKey: isFakeOrg ? '' : decryptApiKey(orgRow.apiKey!),
          systemPrompt: orgRow.systemPrompt,
          source: 'org',
        }
      }
    }
  }
  // Fall through to system
  const systemRow = await prisma.systemAIConfig.findFirst()
  const isFakeSys = systemRow?.provider === 'fake'
  if (systemRow && systemRow.enabled && (isFakeSys || systemRow.apiKey)) {
    return {
      provider: systemRow.provider as AIProvider,
      model: systemRow.model,
      apiKey: isFakeSys ? '' : decryptApiKey(systemRow.apiKey),
      systemPrompt: systemRow.systemPrompt,
      source: 'system',
    }
  }
  return null
}

// ── Connection test ───────────────────────────────────────────────────────────

export async function testAIConnection(provider: AIProvider, apiKey: string, model: string): Promise<{ ok: boolean; error?: string }> {
  if (provider === 'fake') return { ok: true }
  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return { ok: false, error: `OpenAI: ${res.status} ${res.statusText}` }
      return { ok: true }
    }
    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      )
      if (!res.ok) return { ok: false, error: `Gemini: ${res.status} ${res.statusText}` }
      return { ok: true }
    }
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      })
      if (!res.ok) return { ok: false, error: `Anthropic: ${res.status} ${res.statusText}` }
      return { ok: true }
    }
    if (provider === 'grok') {
      const res = await fetch('https://api.x.ai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return { ok: false, error: `Grok: ${res.status} ${res.statusText}` }
      return { ok: true }
    }
    if (provider === 'deepseek') {
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return { ok: false, error: `DeepSeek: ${res.status} ${res.statusText}` }
      return { ok: true }
    }
    if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return { ok: false, error: `OpenRouter: ${res.status} ${res.statusText}` }
      return { ok: true }
    }
    return { ok: false, error: 'Unknown provider' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed'
    logger.warn({ provider, err }, '[AIConfig] Test connection failed')
    return { ok: false, error: msg }
  }
}
