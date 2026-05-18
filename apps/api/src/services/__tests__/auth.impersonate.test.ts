import { describe, it, expect } from 'vitest'
import { canImpersonate, buildImpersonatePayload } from '../auth.service.js'

describe('canImpersonate', () => {
  it('returns true for super role', () => {
    expect(canImpersonate({ adminId: 1, organizationId: null, role: 'super' })).toBe(true)
  })

  it('returns true when impersonatorId is set (mid-session switch)', () => {
    expect(canImpersonate({ adminId: 2, organizationId: 5, role: 'admin', impersonatorId: 1 })).toBe(true)
  })

  it('returns false for non-super without impersonatorId', () => {
    expect(canImpersonate({ adminId: 2, organizationId: 5, role: 'admin' })).toBe(false)
  })
})

describe('buildImpersonatePayload', () => {
  it('sets impersonatorId to caller adminId on first impersonation', () => {
    const caller = { adminId: 1, organizationId: null as null, role: 'super' }
    const target = { id: 2, organizationId: 5 as number | null, role: 'admin', propertyIds: undefined }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload).toMatchObject({ adminId: 2, organizationId: 5, role: 'admin', impersonatorId: 1 })
  })

  it('preserves original super adminId when switching targets mid-session', () => {
    const caller = { adminId: 2, organizationId: 5 as number | null, role: 'admin', impersonatorId: 1 }
    const target = { id: 3, organizationId: 7 as number | null, role: 'observer', propertyIds: undefined }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload).toMatchObject({ adminId: 3, organizationId: 7, role: 'observer', impersonatorId: 1 })
  })

  it('includes propertyIds when target is a user-role with assigned properties', () => {
    const caller = { adminId: 1, organizationId: null as null, role: 'super' }
    const target = { id: 4, organizationId: 5 as number | null, role: 'user', propertyIds: [10, 20] }
    const payload = buildImpersonatePayload(caller, target)
    expect(payload.propertyIds).toEqual([10, 20])
  })
})
