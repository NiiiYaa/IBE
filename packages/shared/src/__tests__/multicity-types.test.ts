import type { MultiCityEffective, SystemMultiCityConfigResponse, OrgMultiCityConfigResponse } from '../types/api'

describe('MultiCity types', () => {
  it('MultiCityEffective has enabled and maxLegs', () => {
    const eff: MultiCityEffective = { enabled: true, maxLegs: 3 }
    expect(eff.enabled).toBe(true)
    expect(eff.maxLegs).toBe(3)
  })

  it('SystemMultiCityConfigResponse extends MultiCityEffective', () => {
    const sys: SystemMultiCityConfigResponse = { enabled: false, maxLegs: 2 }
    expect(sys).toBeDefined()
  })

  it('OrgMultiCityConfigResponse has nullable fields + effective', () => {
    const org: OrgMultiCityConfigResponse = { enabled: null, maxLegs: null, effective: { enabled: false, maxLegs: 3 } }
    expect(org.enabled).toBeNull()
    expect(org.effective.enabled).toBe(false)
  })
})
