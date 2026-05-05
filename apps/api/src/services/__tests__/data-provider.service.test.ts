import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/client.js', () => ({
  prisma: {
    systemDataProviderConfig: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    orgDataProviderConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    propertyDataProviderConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    property: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/env.js', () => ({
  env: { DATAFORSEO_LOGIN: 'env-login', DATAFORSEO_PASSWORD: 'env-pass', DATA_PROVIDER_ENCRYPTION_KEY: undefined },
}))

import { prisma } from '../../db/client.js'
import {
  getSystemConfig,
  getOrgConfig,
  getEffectiveConfig,
  encryptCredential,
  decryptCredential,
  maskLogin,
  maskPassword,
} from '../data-provider.service.js'

const mockPrisma = prisma as any

beforeEach(() => { vi.clearAllMocks() })

describe('encryptCredential / decryptCredential', () => {
  it('round-trips plain text when no encryption key is set', () => {
    const enc = encryptCredential('hello@example.com')
    expect(decryptCredential(enc)).toBe('hello@example.com')
  })
})

describe('maskLogin', () => {
  it('masks the local part but keeps the domain', () => {
    const enc = encryptCredential('nir@hyperguest.com')
    expect(maskLogin(enc)).toBe('****@hyperguest.com')
  })

  it('returns **** when stored value has no @ character', () => {
    const enc = encryptCredential('nologin')
    expect(maskLogin(enc)).toBe('****')
  })
})

describe('maskPassword', () => {
  it('always returns ****', () => {
    expect(maskPassword(encryptCredential('s3cr3t'))).toBe('****')
  })
})

describe('getSystemConfig', () => {
  it('returns defaults when no row exists', async () => {
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue(null)
    const result = await getSystemConfig()
    expect(result).toEqual({ providerType: 'dataforseo', refreshIntervalDays: 30, enabled: false, openToAll: true })
  })

  it('returns stored values including openToAll', async () => {
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({
      providerType: 'dataforseo', refreshIntervalDays: 14, enabled: true, openToAll: false,
    })
    const result = await getSystemConfig()
    expect(result.openToAll).toBe(false)
    expect(result.enabled).toBe(true)
  })
})

describe('getOrgConfig', () => {
  it('returns null when no row exists', async () => {
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue(null)
    expect(await getOrgConfig(1)).toBeNull()
  })

  it('maps loginSet and passwordMasked correctly', async () => {
    const encLogin = encryptCredential('org@test.com')
    const encPass = encryptCredential('secret')
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue({
      organizationId: 1, useSystem: false, refreshIntervalDays: null, enabled: null,
      providerType: 'dataforseo', login: encLogin, password: encPass, systemServiceDisabled: false,
    })
    const result = await getOrgConfig(1)
    expect(result?.loginSet).toBe(true)
    expect(result?.passwordMasked).toBe('****')
    expect(result?.providerType).toBe('dataforseo')
    expect(result?.systemServiceDisabled).toBe(false)
  })
})

describe('getEffectiveConfig', () => {
  it('uses system env credentials when org and property both inherit', async () => {
    mockPrisma.property.findUnique.mockResolvedValue({ propertyId: 1, organizationId: 10 })
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({
      providerType: 'dataforseo', refreshIntervalDays: 30, enabled: true, openToAll: true,
    })
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue(null)
    mockPrisma.propertyDataProviderConfig.findUnique.mockResolvedValue(null)

    const result = await getEffectiveConfig(1)
    expect(result.enabled).toBe(true)
    expect(result.login).toBe('env-login')
    expect(result.password).toBe('env-pass')
  })

  it('uses org credentials when org has useSystem=false', async () => {
    const encLogin = encryptCredential('org@test.com')
    const encPass = encryptCredential('orgpass')
    mockPrisma.property.findUnique.mockResolvedValue({ propertyId: 1, organizationId: 10 })
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({
      providerType: 'dataforseo', refreshIntervalDays: 30, enabled: false, openToAll: true,
    })
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue({
      useSystem: false, refreshIntervalDays: 7, enabled: true,
      providerType: null, login: encLogin, password: encPass, systemServiceDisabled: false,
    })
    mockPrisma.propertyDataProviderConfig.findUnique.mockResolvedValue(null)

    const result = await getEffectiveConfig(1)
    expect(result.enabled).toBe(true)
    expect(result.login).toBe('org@test.com')
    expect(result.password).toBe('orgpass')
  })

  it('uses org own config when openToAll=false even though org has useSystem=true', async () => {
    const encLogin = encryptCredential('org@test.com')
    mockPrisma.property.findUnique.mockResolvedValue({ propertyId: 1, organizationId: 10 })
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({
      providerType: 'dataforseo', refreshIntervalDays: 30, enabled: true, openToAll: false,
    })
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue({
      useSystem: true, refreshIntervalDays: null, enabled: null,
      providerType: null, login: encLogin, password: null, systemServiceDisabled: false,
    })
    mockPrisma.propertyDataProviderConfig.findUnique.mockResolvedValue(null)

    const result = await getEffectiveConfig(1)
    expect(result.login).toBe('org@test.com')
  })

  it('uses property credentials when useOrg=false', async () => {
    const encLogin = encryptCredential('prop@test.com')
    const encPass = encryptCredential('proppass')
    mockPrisma.property.findUnique.mockResolvedValue({ propertyId: 1, organizationId: 10 })
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({
      providerType: 'dataforseo', refreshIntervalDays: 30, enabled: false, openToAll: true,
    })
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue({
      useSystem: false, refreshIntervalDays: 7, enabled: false,
      providerType: null, login: null, password: null, systemServiceDisabled: false,
    })
    mockPrisma.propertyDataProviderConfig.findUnique.mockResolvedValue({
      useOrg: false, refreshIntervalDays: 3, enabled: true,
      providerType: null, login: encLogin, password: encPass, orgServiceDisabled: false,
    })

    const result = await getEffectiveConfig(1)
    expect(result.enabled).toBe(true)
    expect(result.login).toBe('prop@test.com')
  })

  it('uses property own config when orgServiceDisabled=true even with useOrg=true', async () => {
    const encLogin = encryptCredential('prop@test.com')
    mockPrisma.property.findUnique.mockResolvedValue({ propertyId: 1, organizationId: 10 })
    mockPrisma.systemDataProviderConfig.findFirst.mockResolvedValue({
      providerType: 'dataforseo', refreshIntervalDays: 30, enabled: true, openToAll: true,
    })
    mockPrisma.orgDataProviderConfig.findUnique.mockResolvedValue(null)
    mockPrisma.propertyDataProviderConfig.findUnique.mockResolvedValue({
      useOrg: true, refreshIntervalDays: null, enabled: null,
      providerType: null, login: encLogin, password: null, orgServiceDisabled: true,
    })

    const result = await getEffectiveConfig(1)
    expect(result.login).toBe('prop@test.com')
  })
})
