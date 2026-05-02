import { createRequire } from 'module'
import { prisma } from '../db/client.js'
import { resolveAIConfig, encryptApiKey, decryptApiKey } from './ai-config.service.js'
import { getProviderAdapter } from '../ai/adapters/index.js'
import type { TranslationNamespace, TranslationRow, TranslationLocaleStatus, TranslationStatusResponse, AutoTranslateProgressEvent, TranslationAIConfigResponse, TranslationAIConfigUpdate, AIProvider } from '@ibe/shared'
import { TRANSLATION_NAMESPACES } from '@ibe/shared'

const _require = createRequire(import.meta.url)

let _enSource: Record<TranslationNamespace, Record<string, string>> | null = null

function getEnglishSource(): Record<TranslationNamespace, Record<string, string>> {
  if (_enSource) return _enSource
  _enSource = _require('../translations/en.json') as Record<TranslationNamespace, Record<string, string>>
  return _enSource
}

export function getEnglishKeys(namespace: TranslationNamespace): Record<string, string> {
  return getEnglishSource()[namespace] ?? {}
}

export function getAllEnglishKeys(): Record<string, string> {
  const src = getEnglishSource()
  const flat: Record<string, string> = {}
  for (const ns of TRANSLATION_NAMESPACES) {
    for (const [k, v] of Object.entries(src[ns] ?? {})) {
      flat[`${ns}.${k}`] = v
    }
  }
  return flat
}

export async function getTranslationsForLocale(locale: string): Promise<Record<string, string>> {
  const rows = await prisma.translation.findMany({ where: { locale } })
  const map: Record<string, string> = { ...getAllEnglishKeys() }
  for (const row of rows) {
    map[`${row.namespace}.${row.key}`] = row.value
  }
  return map
}

export async function getTranslationStatus(): Promise<TranslationStatusResponse> {
  const src = getEnglishSource()
  const locales = await prisma.translation.findMany({
    select: { locale: true },
    distinct: ['locale'],
  })

  return Promise.all(
    locales.map(async ({ locale }) => {
      const existing = await prisma.translation.findMany({
        where: { locale },
        select: { namespace: true, key: true },
      })
      const existingSet = new Set(existing.map(r => `${r.namespace}.${r.key}`))

      let totalMissing = 0
      const namespaces = TRANSLATION_NAMESPACES.map(ns => {
        const keys = Object.keys(src[ns] ?? {})
        const translated = keys.filter(k => existingSet.has(`${ns}.${k}`)).length
        const missing = keys.length - translated
        totalMissing += missing
        return { namespace: ns, total: keys.length, translated, missing }
      })

      return { locale, totalMissing, namespaces } satisfies TranslationLocaleStatus
    }),
  )
}

export async function listTranslationsForNamespace(
  locale: string,
  namespace: TranslationNamespace,
): Promise<TranslationRow[]> {
  const enKeys = getEnglishKeys(namespace)
  const existing = await prisma.translation.findMany({
    where: { locale, namespace },
    select: { key: true, value: true },
  })
  const existingMap = Object.fromEntries(existing.map(r => [r.key, r.value]))

  return Object.entries(enKeys).map(([key, en]) => ({
    key,
    en,
    value: existingMap[key] ?? null,
  }))
}

export async function upsertTranslation(
  locale: string,
  namespace: string,
  key: string,
  value: string,
): Promise<void> {
  await prisma.translation.upsert({
    where: { locale_namespace_key: { locale, namespace, key } },
    create: { locale, namespace, key, value },
    update: { value },
  })
}

export async function deleteTranslationsForLocale(locale: string): Promise<void> {
  await prisma.translation.deleteMany({ where: { locale } })
}

const BATCH_SIZE = 20
const BATCH_DELAY_MS = 150

// ── Translation AI config ─────────────────────────────────────────────────────

function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`
}

export async function getTranslationAIConfig(): Promise<TranslationAIConfigResponse> {
  const row = await prisma.translationAIConfig.findFirst()
  const systemRow = await prisma.systemAIConfig.findFirst()
  const systemDefault = systemRow ? { provider: systemRow.provider as AIProvider, model: systemRow.model } : null

  if (!row) return { useSystemDefault: true, provider: null, model: null, apiKeySet: false, apiKeyMasked: null, systemDefault }

  const decrypted = row.apiKey ? decryptApiKey(row.apiKey) : null
  return {
    useSystemDefault: row.useSystemDefault,
    provider: (row.provider as AIProvider) ?? null,
    model: row.model ?? null,
    apiKeySet: !!row.apiKey,
    apiKeyMasked: decrypted ? maskApiKey(decrypted) : null,
    systemDefault,
  }
}

export async function upsertTranslationAIConfig(data: TranslationAIConfigUpdate): Promise<TranslationAIConfigResponse> {
  const existing = await prisma.translationAIConfig.findFirst()
  const updateData: Record<string, unknown> = {}

  if (data.useSystemDefault !== undefined) updateData.useSystemDefault = data.useSystemDefault
  if (data.provider !== undefined) updateData.provider = data.provider
  if (data.model !== undefined) updateData.model = data.model
  if (data.apiKey) updateData.apiKey = encryptApiKey(data.apiKey)

  if (existing) {
    await prisma.translationAIConfig.update({ where: { id: existing.id }, data: updateData })
  } else {
    await prisma.translationAIConfig.create({ data: { useSystemDefault: true, ...updateData } })
  }

  return getTranslationAIConfig()
}

export async function translateSingleString(
  locale: string,
  namespace: string,
  key: string,
): Promise<string> {
  const translationAiRow = await prisma.translationAIConfig.findFirst()
  let aiConfig: { provider: AIProvider; model: string; apiKey: string } | null = null

  if (translationAiRow && !translationAiRow.useSystemDefault && translationAiRow.provider && translationAiRow.apiKey) {
    const isFake = translationAiRow.provider === 'fake'
    aiConfig = { provider: translationAiRow.provider as AIProvider, model: translationAiRow.model ?? '', apiKey: isFake ? '' : decryptApiKey(translationAiRow.apiKey) }
  } else {
    const systemRow = await prisma.systemAIConfig.findFirst()
    const isFake = systemRow?.provider === 'fake'
    if (systemRow && (isFake || systemRow.apiKey)) {
      aiConfig = { provider: systemRow.provider as AIProvider, model: systemRow.model, apiKey: isFake ? '' : decryptApiKey(systemRow.apiKey) }
    }
  }
  if (!aiConfig) throw new Error('No AI config found at system level.')

  const src = getEnglishSource()
  const enValue = (src[namespace as TranslationNamespace] ?? {})[key]
  if (!enValue) throw new Error(`Key not found: ${namespace}.${key}`)

  const adapter = getProviderAdapter(aiConfig.provider)
  const langName = new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
  const result = await adapter.call(
    [{ role: 'user', content: `Translate this hotel booking UI string to ${langName}. Return ONLY the translated text, no quotes. Keep all {placeholder} tokens exactly as-is:\n${enValue}` }],
    [],
    `You are a hotel booking UI translator. Translate accurately and concisely to ${langName}. Never translate or rename {placeholder} tokens — they are runtime variables.`,
    aiConfig.apiKey,
    aiConfig.model,
  )
  const translated = result.text?.trim() ?? ''
  if (!translated) throw new Error('AI returned empty translation')
  await upsertTranslation(locale, namespace, key, translated)
  return translated
}

export function getTotalStringCount(): number {
  const src = getEnglishSource()
  return TRANSLATION_NAMESPACES.reduce((sum, ns) => sum + Object.keys(src[ns] ?? {}).length, 0)
}

export async function autoTranslateMissing(
  locale: string,
  namespace: TranslationNamespace | null,
  onProgress: (event: AutoTranslateProgressEvent) => void,
  limit?: number,
): Promise<void> {
  // Prefer translation-specific AI config; fall back to system AI
  // Note: does NOT check systemRow.enabled — that flag gates the guest AI assistant, not internal translation
  const translationAiRow = await prisma.translationAIConfig.findFirst()
  let aiConfig = null

  if (translationAiRow && !translationAiRow.useSystemDefault && translationAiRow.provider && translationAiRow.apiKey) {
    const isFake = translationAiRow.provider === 'fake'
    aiConfig = {
      provider: translationAiRow.provider as AIProvider,
      model: translationAiRow.model ?? '',
      apiKey: isFake ? '' : decryptApiKey(translationAiRow.apiKey),
      systemPrompt: null,
      source: 'system' as const,
    }
  } else {
    const systemRow = await prisma.systemAIConfig.findFirst()
    const isFake = systemRow?.provider === 'fake'
    if (systemRow && (isFake || systemRow.apiKey)) {
      aiConfig = {
        provider: systemRow.provider as AIProvider,
        model: systemRow.model,
        apiKey: isFake ? '' : decryptApiKey(systemRow.apiKey),
        systemPrompt: systemRow.systemPrompt,
        source: 'system' as const,
      }
    }
  }

  if (!aiConfig) throw new Error('No AI config found at system level. Configure an AI model in Admin → AI → Configuration first.')

  const src = getEnglishSource()
  const namespacesToProcess = namespace ? [namespace] : [...TRANSLATION_NAMESPACES]

  // Find all missing keys across requested namespaces
  const existing = await prisma.translation.findMany({
    where: { locale, ...(namespace ? { namespace } : {}) },
    select: { namespace: true, key: true },
  })
  const existingSet = new Set(existing.map(r => `${r.namespace}.${r.key}`))

  const missing: Array<{ namespace: TranslationNamespace; key: string; en: string }> = []
  for (const ns of namespacesToProcess) {
    for (const [key, en] of Object.entries(src[ns] ?? {})) {
      if (!existingSet.has(`${ns}.${key}`)) {
        missing.push({ namespace: ns, key, en })
      }
    }
  }

  if (missing.length === 0) {
    onProgress({ type: 'done', count: 0 })
    return
  }

  const toProcess = limit ? missing.slice(0, limit) : missing

  const adapter = getProviderAdapter(aiConfig.provider)
  const localeName = new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
  let count = 0

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE)
    const inputObj: Record<string, string> = {}
    for (const item of batch) inputObj[`${item.namespace}.${item.key}`] = item.en

    const systemPrompt = `You are a hotel booking engine UI translator. Translate the English UI strings to ${localeName}. Return ONLY a valid JSON object mapping each key to its translated string. No extra text, no markdown. Keep all {placeholder} tokens exactly as-is — they are runtime variables.`
    const userMessage = `Translate to ${localeName}:\n${JSON.stringify(inputObj, null, 2)}`

    try {
      const result = await adapter.call(
        [{ role: 'user', content: userMessage }],
        [],
        systemPrompt,
        aiConfig.apiKey,
        aiConfig.model,
      )

      const text = result.text?.trim() ?? ''
      const jsonStart = text.indexOf('{')
      const jsonEnd = text.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('AI returned no JSON')

      const raw = text.slice(jsonStart, jsonEnd + 1)
      // AI sometimes produces invalid JSON escape sequences (e.g. \' or \h) — strip them
      const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, (_, c: string) => c)
      const parsed = JSON.parse(sanitized) as Record<string, string>

      for (const item of batch) {
        const fullKey = `${item.namespace}.${item.key}`
        const translated = parsed[fullKey]
        if (typeof translated === 'string' && translated.trim()) {
          await upsertTranslation(locale, item.namespace, item.key, translated.trim())
          onProgress({ type: 'progress', namespace: item.namespace, key: item.key, value: translated.trim() })
          count++
        }
      }
    } catch (err) {
      onProgress({ type: 'error', message: err instanceof Error ? err.message : 'Translation batch failed' })
      return
    }

    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  onProgress({ type: 'done', count })
}
