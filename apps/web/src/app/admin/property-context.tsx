'use client'

import { createContext, useContext, useState } from 'react'

interface AdminPropertyContextValue {
  propertyId: number | null  // null = "All Properties" / org-level
  setPropertyId: (id: number | null) => void
}

const AdminPropertyContext = createContext<AdminPropertyContextValue>({
  propertyId: null,
  setPropertyId: () => {},
})

export function useAdminProperty() {
  return useContext(AdminPropertyContext)
}

const STORAGE_KEY = 'ibe-admin-property-id'

export function AdminPropertyProvider({ children }: { children: React.ReactNode }) {
  const [propertyId, setPropertyIdState] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored || stored === 'null') return null
    const parsed = parseInt(stored, 10)
    return !isNaN(parsed) ? parsed : null
  })

  function setPropertyId(id: number | null) {
    setPropertyIdState(id)
    localStorage.setItem(STORAGE_KEY, id == null ? 'null' : String(id))
  }

  return (
    <AdminPropertyContext.Provider value={{ propertyId, setPropertyId }}>
      {children}
    </AdminPropertyContext.Provider>
  )
}
