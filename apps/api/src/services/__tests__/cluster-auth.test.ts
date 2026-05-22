import { describe, it, expect } from 'vitest'
import { buildImpersonatePayload } from '../auth.service.js'
import type { AdminPayload } from '../auth.service.js'

describe('buildImpersonatePayload — clusterScope', () => {
  it('copies clusterScope=true from target', () => {
    const caller: AdminPayload = { adminId: 1, organizationId: null, role: 'super' }
    const target = { id: 42, organizationId: 5, role: 'admin', clusterScope: true }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload.clusterScope).toBe(true)
    expect(payload.adminId).toBe(42)
  })

  it('copies clusterScope=false from target', () => {
    const caller: AdminPayload = { adminId: 1, organizationId: null, role: 'super' }
    const target = { id: 42, organizationId: 5, role: 'admin', clusterScope: false }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload.clusterScope).toBe(false)
  })

  it('defaults clusterScope to false when not provided', () => {
    const caller: AdminPayload = { adminId: 1, organizationId: null, role: 'super' }
    const target = { id: 42, organizationId: 5, role: 'admin' }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload.clusterScope).toBe(false)
  })
})
