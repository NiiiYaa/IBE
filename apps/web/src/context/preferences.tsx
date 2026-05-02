'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur'])

interface PreferencesContextValue {
  locale: string
  currency: string
  setLocale: (v: string) => void
  setCurrency: (v: string) => void
}

const PreferencesContext = createContext<PreferencesContextValue>({
  locale: 'en',
  currency: 'USD',
  setLocale: () => {},
  setCurrency: () => {},
})

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState('en')
  const [currency, setCurrencyState] = useState('USD')

  useEffect(() => {
    const savedLocale = localStorage.getItem('ibe-locale')
    const savedCurrency = localStorage.getItem('ibe-currency')
    if (savedLocale) setLocaleState(savedLocale)
    if (savedCurrency) setCurrencyState(savedCurrency)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'
  }, [locale])

  function setLocale(v: string) {
    setLocaleState(v)
    localStorage.setItem('ibe-locale', v)
  }

  function setCurrency(v: string) {
    setCurrencyState(v)
    localStorage.setItem('ibe-currency', v)
  }

  return (
    <PreferencesContext.Provider value={{ locale, currency, setLocale, setCurrency }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  return useContext(PreferencesContext)
}
