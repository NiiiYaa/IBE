'use client'

import { createContext, useContext, useMemo } from 'react'
import { usePreferences } from '@/context/preferences'

type TranslationsMap = Record<string, string>

interface TranslationsContextValue {
  maps: Record<string, TranslationsMap>
  defaultLocale: string
}

const TranslationsContext = createContext<TranslationsContextValue>({ maps: {}, defaultLocale: 'en' })

export function TranslationsProvider({
  defaultLocale,
  maps,
  children,
}: {
  defaultLocale: string
  maps: Record<string, TranslationsMap>
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ maps, defaultLocale }), [maps, defaultLocale])
  return <TranslationsContext.Provider value={value}>{children}</TranslationsContext.Provider>
}

export function useT(namespace: string) {
  const { maps, defaultLocale } = useContext(TranslationsContext)
  const { locale } = usePreferences()
  const map = maps[locale] ?? maps[defaultLocale] ?? {}

  return function t(key: string, vars?: Record<string, string | number>): string {
    const fullKey = `${namespace}.${key}`
    let value = map[fullKey] ?? key
    if (vars) {
      value = value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
    }
    return value
  }
}

export function useLocale() {
  const { locale } = usePreferences()
  return locale
}
