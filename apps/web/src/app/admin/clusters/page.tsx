'use client'

import { useState } from 'react'
import { useAdminAuth } from '@/hooks/use-admin-auth'

type Tab = 'Configurations' | 'Hotels' | 'Users'
const TABS: Tab[] = ['Configurations', 'Hotels', 'Users']

// ─── placeholder sections (filled in Tasks 10-12) ────────────────────────────

function ConfigurationsTab({ orgId }: { orgId: number | null }) {
  return <p className="text-sm text-[var(--color-text-muted)] italic">Loading configurations…</p>
}

function HotelsTab({ orgId }: { orgId: number | null }) {
  return <p className="text-sm text-[var(--color-text-muted)] italic">Loading hotels…</p>
}

function UsersTab({ orgId }: { orgId: number | null }) {
  return <p className="text-sm text-[var(--color-text-muted)] italic">Loading users…</p>
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClustersPage() {
  const { admin } = useAdminAuth()
  const [activeTab, setActiveTab] = useState<Tab>('Configurations')

  if (!admin) return null

  const isSuper = admin.role === 'super'
  const orgId = isSuper ? null : admin.organizationId   // super passes orgId via query when needed

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Clusters</h1>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)] -mb-px'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Configurations' && <ConfigurationsTab orgId={orgId} />}
      {activeTab === 'Hotels' && <HotelsTab orgId={orgId} />}
      {activeTab === 'Users' && <UsersTab orgId={orgId} />}
    </main>
  )
}
