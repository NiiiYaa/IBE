import { describe, it, expect } from 'vitest'
import type { MultiCityEffective, SystemMultiCityConfigResponse, OrgMultiCityConfigResponse } from '../types/api'

describe('MultiCity types', () => {
  it('MultiCityEffective has all required fields', () => {
    const eff: MultiCityEffective = {
      enabled: true, maxLegs: 3,
      discountEnabled: false, discountPercent: 0,
      incentiveEnabled: false, incentivePackageId: null,
    }
    expect(eff.enabled).toBe(true)
    expect(eff.maxLegs).toBe(3)
    expect(eff.discountEnabled).toBe(false)
  })

  it('SystemMultiCityConfigResponse extends MultiCityEffective', () => {
    const sys: SystemMultiCityConfigResponse = {
      enabled: false, maxLegs: 2,
      discountEnabled: true, discountPercent: 5,
      incentiveEnabled: false, incentivePackageId: null,
    }
    expect(sys).toBeDefined()
  })

  it('OrgMultiCityConfigResponse has nullable fields + effective', () => {
    const org: OrgMultiCityConfigResponse = {
      enabled: null, maxLegs: null,
      discountEnabled: null, discountPercent: null,
      incentiveEnabled: null, incentivePackageId: null,
      effective: {
        enabled: false, maxLegs: 3,
        discountEnabled: false, discountPercent: 0,
        incentiveEnabled: false, incentivePackageId: null,
      },
    }
    expect(org.enabled).toBeNull()
    expect(org.effective.enabled).toBe(false)
  })
})
