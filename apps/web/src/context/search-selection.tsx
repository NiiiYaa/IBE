'use client'

import { createContext, useContext, useState } from 'react'

interface SearchSelection {
  propertyId: number | null
  propertyName: string
  city: string
}

const SearchSelectionContext = createContext<{
  selection: SearchSelection
  setSelection: (s: SearchSelection) => void
} | null>(null)

export function SearchSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<SearchSelection>({ propertyId: null, propertyName: '', city: '' })
  return (
    <SearchSelectionContext.Provider value={{ selection, setSelection }}>
      {children}
    </SearchSelectionContext.Provider>
  )
}

export function useSearchSelection() {
  const ctx = useContext(SearchSelectionContext)
  if (!ctx) throw new Error('useSearchSelection must be used inside SearchSelectionProvider')
  return ctx
}
