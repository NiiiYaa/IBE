const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  ar: 'العربية',
  zh: '中文',
  ja: '日本語',
  ru: 'Русский',
  he: 'עברית',
  tr: 'Türkçe',
  ko: '한국어',
  pl: 'Polski',
  sv: 'Svenska',
}

export function localeName(code: string): string {
  return LOCALE_NAMES[code] ?? code.toUpperCase()
}

export function localeFlag(code: string): string {
  const flags: Record<string, string> = {
    en: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹',
    pt: '🇵🇹', nl: '🇳🇱', ar: '🇸🇦', zh: '🇨🇳', ja: '🇯🇵',
    ru: '🇷🇺', he: '🇮🇱', tr: '🇹🇷', ko: '🇰🇷', pl: '🇵🇱', sv: '🇸🇪',
  }
  return flags[code] ?? '🌐'
}
