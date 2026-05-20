export const DYNAMIC_TYPES = [
  { key: 'incentive_items' as const, label: 'Incentives' },
  { key: 'hotel_facilities' as const, label: 'Hotel Facilities' },
  { key: 'room_facilities' as const, label: 'Room Facilities' },
] as const

export type DynamicTypeKey = typeof DYNAMIC_TYPES[number]['key']
export const FACILITY_TYPES = new Set<DynamicTypeKey>(['hotel_facilities', 'room_facilities'])

export function getAvailableDynamicTypes(isSystemLevel: boolean) {
  return isSystemLevel ? DYNAMIC_TYPES : DYNAMIC_TYPES.filter(t => !FACILITY_TYPES.has(t.key))
}

type TranslationStatus = Array<{ locale: string; namespaces: Array<{ translated: number }> }>

export function buildCoverageMap(
  translationStatus: TranslationStatus | undefined,
  translationTotal: { total: number } | undefined,
): Record<string, number> {
  if (!translationStatus || !translationTotal || translationTotal.total === 0) return {}
  const total = translationTotal.total
  return Object.fromEntries(
    translationStatus.map(s => {
      const translated = s.namespaces.reduce((sum, n) => sum + n.translated, 0)
      return [s.locale, Math.round((translated / total) * 100)]
    })
  )
}

export function sortLocalesByCoverage(
  locales: string[],
  coverageMap: Record<string, number>,
  getEnglishName: (code: string) => string,
): string[] {
  return [...locales].sort((a, b) => {
    const pctA = coverageMap[a] ?? 0
    const pctB = coverageMap[b] ?? 0
    if (pctB !== pctA) return pctB - pctA
    return getEnglishName(a).localeCompare(getEnglishName(b))
  })
}
