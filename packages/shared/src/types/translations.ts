export const TRANSLATION_NAMESPACES = [
  'common', 'search', 'properties', 'rooms', 'booking',
  'confirmation', 'account', 'groups', 'crossSell',
] as const

export type TranslationNamespace = typeof TRANSLATION_NAMESPACES[number]

export interface TranslationRow {
  key: string
  en: string
  value: string | null
}

export interface TranslationNamespaceStatus {
  namespace: TranslationNamespace
  total: number
  translated: number
  missing: number
}

export interface TranslationLocaleStatus {
  locale: string
  totalMissing: number
  namespaces: TranslationNamespaceStatus[]
}

export type TranslationStatusResponse = TranslationLocaleStatus[]

export type TranslationMapResponse = Record<string, string>

export interface AutoTranslateRequest {
  locale: string
  namespace?: TranslationNamespace
}

export type AutoTranslateProgressEvent =
  | { type: 'progress'; namespace: string; key: string; value: string }
  | { type: 'done'; count: number }
  | { type: 'error'; message: string }
