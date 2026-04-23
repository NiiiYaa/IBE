'use client'

import { createContext, useContext, useState } from 'react'

interface AdminPropertyContextValue {
  propertyId: number | null  // null = "All Properties" / org-level
  orgId: number | null       // set when super user selects an org chain
  setPropertyId: (id: number | null) => void
  setSelection: (propertyId: number | null, orgId: number | null) => void
}

const AdminPropertyContext = createContext<AdminPropertyContextValue>({
  propertyId: null,
  orgId: null,
  setPropertyId: () => {},
  setSelection: () => {},
})

export function useAdminProperty() {
  return useContext(AdminPropertyContext)
}

const STORAGE_KEY = 'ibe-admin-property-id'
const STORAGE_ORG_KEY = 'ibe-admin-org-id'

export function AdminPropertyProvider({ children }: { children: React.ReactNode }) {
  const [propertyId, setPropertyIdState] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored || stored === 'null') return null
    const parsed = parseInt(stored, 10)
    return !isNaN(parsed) ? parsed : null
  })

  const [orgId, setOrgIdState] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_ORG_KEY)
    if (!stored || stored === 'null') return null
    const parsed = parseInt(stored, 10)
    return !isNaN(parsed) ? parsed : null
  })

  function setSelection(pid: number | null, oid: number | null) {
    setPropertyIdState(pid)
    setOrgIdState(oid)
    localStorage.setItem(STORAGE_KEY, pid == null ? 'null' : String(pid))
    localStorage.setItem(STORAGE_ORG_KEY, oid == null ? 'null' : String(oid))
  }

  function setPropertyId(id: number | null) {
    setSelection(id, null)
  }

  return (
    <AdminPropertyContext.Provider value={{ propertyId, orgId, setPropertyId, setSelection }}>
      {children}
    </AdminPropertyContext.Provider>
  )
}
