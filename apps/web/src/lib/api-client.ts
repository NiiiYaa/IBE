/**
 * Typed API client for communicating with apps/api.
 * All requests go through this module — no ad-hoc fetch() calls in components.
 */

import type {
  SearchResponse,
  PropertyDetail,
  BookingConfirmation,
  CreateBookingRequest,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  HotelDesignConfig,
  UpdateDesignConfigRequest,
  OrgDesignDefaultsConfig,
  PropertyDesignAdminResponse,
  NavItem,
  CreateNavItemRequest,
  UpdateNavItemRequest,
  OrgNavItem,
  CreateOrgNavItemRequest,
  UpdateOrgNavItemRequest,
  PropertyRecord,
  PropertyListResponse,
  PropertyMode,
  PropertyUserAssignment,
  OrgSettingsResponse,
  UpdateOrgSettingsRequest,
  ExchangeRatesResponse,
  PromoCode,
  CreatePromoCodeRequest,
  UpdatePromoCodeRequest,
  CommunicationSettingsResponse,
  UpdateCommunicationSettingsRequest,
  MessageRule,
  CreateMessageRuleRequest,
  UpdateMessageRuleRequest,
  PriceComparisonOta,
  CreatePriceComparisonOtaRequest,
  UpdatePriceComparisonOtaRequest,
  PriceComparisonResponse,
  Affiliate,
  CreateAffiliateRequest,
  UpdateAffiliateRequest,
  Campaign,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  AdminUserRecord,
  CreateAdminUserRequest,
  CreateAdminUserResponse,
  UpdateAdminUserRequest,
  OrgRecord,
  CreateOrgRequest,
  SetPropertyOverrideRequest,
  OrgOffersSettings,
  PropertyOffersAdminResponse,
  UpdateOffersSettingsRequest,
  ImportSummary,
  OnsiteConversionSettings,
  OnsiteStats,
  UpdateOnsiteConversionRequest,
  PropertyOnsiteConversionAdminResponse,
  UpdateOnsiteConversionOverridesRequest,
  AdminBookingsResponse,
  GuestProfile,
  GuestBookingSummary,
  GuestBookingDetail,
  AdminGuestRow,
  AdminGuestProfile,
  AdminGuestsResponse,
  ChainImagesResponse,
  TrackingPixel,
  CreateTrackingPixelRequest,
  UpdateTrackingPixelRequest,
  MarketingSettings,
  PropertyMarketingSettingsResponse,
  UpdateMarketingSettingsRequest,
  UpdatePropertyMarketingSettingsRequest,
  ApiError,
} from '@ibe/shared'

// Use '' (empty string) so all API calls go to the same origin as the frontend.
// Next.js rewrites /api/* → the backend API server (configured in next.config.js).
// This works whether the browser is local or remote — no direct port access needed.
const BASE_URL = ''

class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: ApiError['details'],
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const hasBody = options?.body !== undefined
  const isFormData = options?.body instanceof FormData
  const fetchOptions: RequestInit = {
    headers: {
      ...(hasBody && !isFormData && { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
    ...options,
  }

  // Retry on 503 (DB temporarily unavailable) or network errors for up to ~60s.
  const maxAttempts = 12
  const retryDelayMs = 5000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response
    try {
      response = await fetch(url, fetchOptions)
    } catch {
      // Network error — server unreachable (e.g. restarting)
      if (attempt >= maxAttempts - 1) throw new ApiClientError('NETWORK_ERROR', 'Request failed', 0)
      await new Promise(r => setTimeout(r, retryDelayMs))
      continue
    }

    if (response.status === 503) {
      if (attempt >= maxAttempts - 1) throw new ApiClientError('DB_UNAVAILABLE', 'Database temporarily unavailable', 503)
      await new Promise(r => setTimeout(r, retryDelayMs))
      continue
    }

    if (response.status === 204) return undefined as T

    const raw = await response.text().catch(() => '')
    let body: T | ApiError | undefined
    try {
      if (raw) body = JSON.parse(raw) as T | ApiError
    } catch {
      throw new ApiClientError(`HTTP_${response.status}`, raw.slice(0, 200) || response.statusText || 'Request failed', response.status)
    }

    if (!response.ok) {
      const err = (body ?? {}) as ApiError
      throw new ApiClientError(
        err.code ?? `HTTP_${response.status}`,
        err.message || err.error || raw.slice(0, 200) || response.statusText || 'Request failed',
        response.status,
        err.details,
      )
    }

    return body as T
  }

  throw new ApiClientError('NETWORK_ERROR', 'Request failed', 0)
}

export interface AdminMe {
  id: number
  email: string
  name: string
  role: string  // 'super' | 'admin' | 'observer' | 'user'
  organizationId: number | null
  isActive: boolean
  mustChangePassword: boolean
  propertyIds?: number[]
}

export const apiClient = {
  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthProviders(): Promise<{ googleOAuth: boolean }> {
    return apiRequest<{ googleOAuth: boolean }>('/api/v1/auth/providers')
  },

  adminLogin(
    email: string,
    password: string,
    adminId?: number,
  ): Promise<
    | { ok: true; role: string; organizationId: number | null; mustChangePassword: boolean; requiresSelection?: never }
    | { requiresSelection: true; accounts: Array<{ adminId: number; name: string; organizationName: string; role: string }>; ok?: never }
  > {
    return apiRequest('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(adminId !== undefined && { adminId }) }),
    })
  },

  adminSignup(data: { email: string; password: string; name: string; orgName: string; hyperGuestOrgId?: string }): Promise<{ ok: boolean; role: string; organizationId: number | null }> {
    return apiRequest('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  adminLogout(): Promise<{ ok: boolean }> {
    return apiRequest('/api/v1/auth/logout', { method: 'POST' })
  },

  adminMe(): Promise<AdminMe> {
    return apiRequest<AdminMe>('/api/v1/auth/me')
  },

  updateMyAdminProfile(data: { name?: string; email?: string; currentPassword?: string; newPassword?: string }): Promise<{ id: number; name: string; email: string }> {
    return apiRequest('/api/v1/auth/me', { method: 'PUT', body: JSON.stringify(data) })
  },
  /** Search availability for a property */
  search(params: URLSearchParams): Promise<SearchResponse> {
    return apiRequest<SearchResponse>(`/api/v1/search?${params.toString()}`)
  },

  /** Get full static data for a property */
  getProperty(propertyId: number): Promise<PropertyDetail> {
    return apiRequest<PropertyDetail>(`/api/v1/properties/${propertyId}`)
  },

  /** Create a booking */
  createBooking(data: CreateBookingRequest): Promise<BookingConfirmation> {
    return apiRequest<BookingConfirmation>('/api/v1/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** Create a Stripe PaymentIntent or SetupIntent for the checkout */
  createPaymentIntent(data: CreatePaymentIntentRequest): Promise<CreatePaymentIntentResponse> {
    return apiRequest<CreatePaymentIntentResponse>('/api/v1/payments/intent', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** Get hotel design config (public, CDN-cacheable) */
  getHotelConfig(propertyId: number): Promise<HotelDesignConfig> {
    return apiRequest<HotelDesignConfig>(`/api/v1/config/property/${propertyId}`)
  },

  /** Get org-level design config by orgId (public, CDN-cacheable) */
  getOrgConfig(orgId: number): Promise<HotelDesignConfig> {
    return apiRequest<HotelDesignConfig>(`/api/v1/config/org/${orgId}`)
  },

  /** Get property list by orgId (public) */
  getOrgPropertyList(orgId: number): Promise<PropertyListResponse> {
    return apiRequest<PropertyListResponse>(`/api/v1/config/properties?orgId=${orgId}`)
  },

  /** Get hotel design config for admin — bypasses browser HTTP cache */
  getHotelConfigAdmin(propertyId: number): Promise<HotelDesignConfig> {
    return apiRequest<HotelDesignConfig>(`/api/v1/config/property/${propertyId}`, { cache: 'no-store' })
  },

  /** Get all chain-featured images for every property in the org — single round-trip */
  getChainImages(): Promise<ChainImagesResponse> {
    return apiRequest<ChainImagesResponse>('/api/v1/admin/design/chain-images')
  },

  /** Get nav items for a property (optionally filtered by section) */
  getNavItems(propertyId: number, section?: string): Promise<NavItem[]> {
    const qs = new URLSearchParams({ propertyId: String(propertyId) })
    if (section) qs.set('section', section)
    return apiRequest<NavItem[]>(`/api/v1/nav-items?${qs}`)
  },

  createNavItem(propertyId: number, data: CreateNavItemRequest): Promise<NavItem> {
    return apiRequest<NavItem>('/api/v1/nav-items', {
      method: 'POST',
      body: JSON.stringify({ propertyId, ...data }),
    })
  },

  updateNavItem(id: string, data: UpdateNavItemRequest): Promise<NavItem> {
    return apiRequest<NavItem>(`/api/v1/nav-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  deleteNavItem(id: string): Promise<void> {
    return apiRequest<void>(`/api/v1/nav-items/${id}`, { method: 'DELETE' })
  },

  reorderNavItems(ids: string[]): Promise<void> {
    return apiRequest<void>('/api/v1/nav-items/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    })
  },

  getOrgNavItems(section?: string): Promise<OrgNavItem[]> {
    const qs = section ? `?section=${encodeURIComponent(section)}` : ''
    return apiRequest<OrgNavItem[]>(`/api/v1/admin/org-nav-items${qs}`)
  },

  createOrgNavItem(data: CreateOrgNavItemRequest): Promise<OrgNavItem> {
    return apiRequest<OrgNavItem>('/api/v1/admin/org-nav-items', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updateOrgNavItem(id: string, data: UpdateOrgNavItemRequest): Promise<OrgNavItem> {
    return apiRequest<OrgNavItem>(`/api/v1/admin/org-nav-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  deleteOrgNavItem(id: string): Promise<void> {
    return apiRequest<void>(`/api/v1/admin/org-nav-items/${id}`, { method: 'DELETE' })
  },

  reorderOrgNavItems(ids: string[]): Promise<void> {
    return apiRequest<void>('/api/v1/admin/org-nav-items/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    })
  },

  // ── Admin: Org & Properties ─────────────────────────────────────────────────

  getOrgSettings(): Promise<OrgSettingsResponse> {
    return apiRequest<OrgSettingsResponse>('/api/v1/admin/org')
  },

  updateOrgSettings(data: UpdateOrgSettingsRequest): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/admin/org', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  listProperties(): Promise<PropertyListResponse> {
    return apiRequest<PropertyListResponse>('/api/v1/admin/properties')
  },

  listAllProperties(): Promise<{ properties: PropertyRecord[] }> {
    return apiRequest<{ properties: PropertyRecord[] }>('/api/v1/admin/super/properties')
  },

  setPropertyMode(mode: PropertyMode): Promise<{ ok: boolean; mode: PropertyMode }> {
    return apiRequest<{ ok: boolean; mode: PropertyMode }>('/api/v1/admin/properties/mode', {
      method: 'PUT',
      body: JSON.stringify({ mode }),
    })
  },

  setShowCitySelector(enabled: boolean): Promise<{ ok: boolean; enabled: boolean }> {
    return apiRequest<{ ok: boolean; enabled: boolean }>('/api/v1/admin/properties/city-selector', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    })
  },

  setShowDemoProperty(enabled: boolean): Promise<{ ok: boolean; enabled: boolean }> {
    return apiRequest<{ ok: boolean; enabled: boolean }>('/api/v1/admin/properties/demo', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    })
  },

  setRateProvider(provider: string): Promise<{ ok: boolean; provider: string }> {
    return apiRequest<{ ok: boolean; provider: string }>('/api/v1/admin/currency/rate-provider', {
      method: 'PUT',
      body: JSON.stringify({ provider }),
    })
  },

  addProperty(propertyId: number): Promise<PropertyRecord> {
    return apiRequest<PropertyRecord>('/api/v1/admin/properties', {
      method: 'POST',
      body: JSON.stringify({ propertyId }),
    })
  },

  importProperties(file: File): Promise<ImportSummary> {
    const form = new FormData()
    form.append('file', file)
    return apiRequest<ImportSummary>('/api/v1/admin/properties/import', { method: 'POST', body: form })
  },

  setDefaultProperty(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/properties/${id}/default`, { method: 'PUT' })
  },

  removeProperty(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/properties/${id}`, { method: 'DELETE' })
  },

  setPropertyActive(id: number, active: boolean): Promise<{ ok: boolean; active: boolean }> {
    return apiRequest<{ ok: boolean; active: boolean }>(`/api/v1/admin/properties/${id}/active`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    })
  },

  getPropertyUsers(id: number): Promise<PropertyUserAssignment[]> {
    return apiRequest<PropertyUserAssignment[]>(`/api/v1/admin/properties/${id}/users`)
  },

  setPropertyUsers(id: number, userIds: number[]): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/properties/${id}/users`, {
      method: 'PUT',
      body: JSON.stringify({ userIds }),
    })
  },

  setPropertyHGCredentials(
    id: number,
    creds: { bearerToken?: string; staticDomain?: string; searchDomain?: string; bookingDomain?: string },
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/properties/${id}/hg-credentials`, {
      method: 'PUT',
      body: JSON.stringify(creds),
    })
  },

  setPropertySubdomain(id: number, subdomain: string | null): Promise<{ ok: boolean; subdomain: string | null }> {
    return apiRequest<{ ok: boolean; subdomain: string | null }>(`/api/v1/admin/properties/${id}/subdomain`, {
      method: 'PUT',
      body: JSON.stringify({ subdomain }),
    })
  },

  /** Get exchange rates from a base currency (cached 6h server-side) */
  getExchangeRates(base: string): Promise<ExchangeRatesResponse> {
    return apiRequest<ExchangeRatesResponse>(`/api/v1/rates?base=${base}`)
  },

  // ── Admin: Promo Codes ──────────────────────────────────────────────────────

  listPromoCodes(propertyId?: number | null): Promise<PromoCode[]> {
    const qs = propertyId != null ? `?propertyId=${propertyId}` : ''
    return apiRequest<PromoCode[]>(`/api/v1/admin/promo-codes${qs}`)
  },

  createPromoCode(data: CreatePromoCodeRequest): Promise<PromoCode> {
    return apiRequest<PromoCode>('/api/v1/admin/promo-codes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updatePromoCode(id: number, data: UpdatePromoCodeRequest): Promise<PromoCode> {
    return apiRequest<PromoCode>(`/api/v1/admin/promo-codes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  deletePromoCode(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/promo-codes/${id}`, { method: 'DELETE' })
  },

  // ── Admin: Affiliates ──────────────────────────────────────────────────────

  listAffiliates(propertyId?: number | null): Promise<Affiliate[]> {
    const qs = propertyId != null ? `?propertyId=${propertyId}` : ''
    return apiRequest<Affiliate[]>(`/api/v1/admin/affiliates${qs}`, { cache: 'no-store' })
  },

  createAffiliate(data: CreateAffiliateRequest): Promise<Affiliate> {
    return apiRequest<Affiliate>('/api/v1/admin/affiliates', { method: 'POST', body: JSON.stringify(data) })
  },

  updateAffiliate(id: number, data: UpdateAffiliateRequest): Promise<Affiliate> {
    return apiRequest<Affiliate>(`/api/v1/admin/affiliates/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  deleteAffiliate(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/affiliates/${id}`, { method: 'DELETE' })
  },

  setPropertyOverride(data: SetPropertyOverrideRequest): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/admin/property-overrides', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // ── Admin: Campaigns ───────────────────────────────────────────────────────

  listCampaigns(propertyId?: number | null): Promise<Campaign[]> {
    const qs = propertyId != null ? `?propertyId=${propertyId}` : ''
    return apiRequest<Campaign[]>(`/api/v1/admin/campaigns${qs}`, { cache: 'no-store' })
  },

  createCampaign(data: CreateCampaignRequest): Promise<Campaign> {
    return apiRequest<Campaign>('/api/v1/admin/campaigns', { method: 'POST', body: JSON.stringify(data) })
  },

  updateCampaign(id: number, data: UpdateCampaignRequest): Promise<Campaign> {
    return apiRequest<Campaign>(`/api/v1/admin/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  deleteCampaign(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/campaigns/${id}`, { method: 'DELETE' })
  },

  getOrgNavItemOverrides(propertyId: number): Promise<Record<string, boolean>> {
    return apiRequest<Record<string, boolean>>(`/api/v1/admin/org-nav-item-overrides?propertyId=${propertyId}`)
  },

  setOrgNavItemOverride(orgNavItemId: string, propertyId: number, isEnabled: boolean): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/admin/org-nav-item-overrides', {
      method: 'PUT',
      body: JSON.stringify({ orgNavItemId, propertyId, isEnabled }),
    })
  },

  // ── Public: Offers Constraints ────────────────────────────────────────────

  getOffersConstraints(propertyId: number): Promise<{ minNights: number; maxNights: number; minRooms: number; maxRooms: number; bookingMode: 'single' | 'multi'; multiRoomLimitBy: 'search' | 'hotel' }> {
    return apiRequest(`/api/v1/offers/constraints/${propertyId}`)
  },

  // ── Guest: Onsite Conversion ───────────────────────────────────────────────

  trackPresence(propertyId: number, sessionId: string): Promise<{ viewerCount: number }> {
    return apiRequest<{ viewerCount: number }>(`/api/v1/onsite/presence/${propertyId}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },

  getOnsiteStats(propertyId: number): Promise<OnsiteStats> {
    return apiRequest<OnsiteStats>(`/api/v1/onsite/stats/${propertyId}`)
  },

  // ── Admin: Onsite Conversion ───────────────────────────────────────────────

  getOnsiteConversionGlobal(): Promise<OnsiteConversionSettings> {
    return apiRequest<OnsiteConversionSettings>('/api/v1/admin/onsite-conversion/global')
  },

  updateOnsiteConversionGlobal(data: UpdateOnsiteConversionRequest): Promise<OnsiteConversionSettings> {
    return apiRequest<OnsiteConversionSettings>('/api/v1/admin/onsite-conversion/global', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  getOnsiteConversionProperty(propertyId: number): Promise<PropertyOnsiteConversionAdminResponse> {
    return apiRequest<PropertyOnsiteConversionAdminResponse>(`/api/v1/admin/onsite-conversion/property/${propertyId}`)
  },

  updateOnsiteConversionProperty(propertyId: number, data: UpdateOnsiteConversionOverridesRequest): Promise<PropertyOnsiteConversionAdminResponse> {
    return apiRequest<PropertyOnsiteConversionAdminResponse>(`/api/v1/admin/onsite-conversion/property/${propertyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // ── Admin: Offers Settings ─────────────────────────────────────────────────

  getOrgOffersSettings(): Promise<OrgOffersSettings> {
    return apiRequest<OrgOffersSettings>('/api/v1/admin/offers/global')
  },

  updateOrgOffersSettings(data: UpdateOffersSettingsRequest): Promise<OrgOffersSettings> {
    return apiRequest<OrgOffersSettings>('/api/v1/admin/offers/global', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  getPropertyOffersAdmin(propertyId: number): Promise<PropertyOffersAdminResponse> {
    return apiRequest<PropertyOffersAdminResponse>(`/api/v1/admin/offers/property/${propertyId}`)
  },

  updatePropertyOffersSettings(propertyId: number, data: UpdateOffersSettingsRequest): Promise<PropertyOffersAdminResponse> {
    return apiRequest<PropertyOffersAdminResponse>(`/api/v1/admin/offers/property/${propertyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // ── Admin: Users ───────────────────────────────────────────────────────────

  getManualInfo(): Promise<{ exists: boolean; size: number; updatedAt: string | null }> {
    return apiRequest('/api/v1/admin/super/manual-info')
  },

  uploadManual(file: File): Promise<{ ok: boolean }> {
    const fd = new FormData()
    fd.append('file', file, file.name)
    return apiRequest('/api/v1/admin/super/manual', { method: 'POST', body: fd })
  },

  listAdminUsers(): Promise<AdminUserRecord[]> {
    return apiRequest<AdminUserRecord[]>('/api/v1/admin/users')
  },

  createAdminUser(data: CreateAdminUserRequest): Promise<CreateAdminUserResponse> {
    return apiRequest<CreateAdminUserResponse>('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(data) })
  },

  updateAdminUser(id: number, data: UpdateAdminUserRequest): Promise<AdminUserRecord> {
    return apiRequest<AdminUserRecord>(`/api/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  resetAdminUserPassword(id: number): Promise<{ temporaryPassword: string }> {
    return apiRequest<{ temporaryPassword: string }>(`/api/v1/admin/users/${id}/reset-password`, { method: 'POST' })
  },

  deleteAdminUser(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/users/${id}`, { method: 'DELETE' })
  },

  listOrgs(): Promise<OrgRecord[]> {
    return apiRequest<OrgRecord[]>('/api/v1/admin/super/orgs')
  },

  createOrg(data: CreateOrgRequest): Promise<OrgRecord> {
    return apiRequest<OrgRecord>('/api/v1/admin/super/orgs', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updateOrg(orgId: number, data: { name?: string; hyperGuestOrgId?: string | null }): Promise<OrgRecord> {
    return apiRequest<OrgRecord>(`/api/v1/admin/super/orgs/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  setOrgActive(orgId: number, isActive: boolean): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/super/orgs/${orgId}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    })
  },

  deleteOrg(orgId: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/super/orgs/${orgId}`, { method: 'DELETE' })
  },

  setOrgHyperGuestId(orgId: number, hyperGuestOrgId: string | null): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/super/orgs/${orgId}/hg-org-id`, {
      method: 'PUT',
      body: JSON.stringify({ hyperGuestOrgId }),
    })
  },

  getUserOrgProperties(userId: number): Promise<PropertyRecord[]> {
    return apiRequest(`/api/v1/admin/users/${userId}/org-properties`)
  },

  setUserProperties(userId: number, propertyIds: number[]): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/users/${userId}/properties`, {
      method: 'PUT',
      body: JSON.stringify({ propertyIds }),
    })
  },

  // ── Admin: Communication ───────────────────────────────────────────────────

  getCommunicationSettings(): Promise<CommunicationSettingsResponse> {
    return apiRequest<CommunicationSettingsResponse>('/api/v1/admin/communication')
  },

  updateCommunicationSettings(data: UpdateCommunicationSettingsRequest): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/admin/communication', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // ── Admin: Message Rules ───────────────────────────────────────────────────

  listMessageRules(propertyId?: number | null): Promise<MessageRule[]> {
    const qs = propertyId != null ? `?propertyId=${propertyId}` : ''
    return apiRequest<MessageRule[]>(`/api/v1/admin/messages${qs}`)
  },

  createMessageRule(data: CreateMessageRuleRequest): Promise<MessageRule> {
    return apiRequest<MessageRule>('/api/v1/admin/messages', { method: 'POST', body: JSON.stringify(data) })
  },

  updateMessageRule(id: number, data: UpdateMessageRuleRequest): Promise<MessageRule> {
    return apiRequest<MessageRule>(`/api/v1/admin/messages/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  deleteMessageRule(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/messages/${id}`, { method: 'DELETE' })
  },

  listPriceComparisonOtas(): Promise<PriceComparisonOta[]> {
    return apiRequest<PriceComparisonOta[]>('/api/v1/admin/price-comparison')
  },

  createPriceComparisonOta(data: CreatePriceComparisonOtaRequest): Promise<PriceComparisonOta> {
    return apiRequest<PriceComparisonOta>('/api/v1/admin/price-comparison', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updatePriceComparisonOta(id: number, data: UpdatePriceComparisonOtaRequest): Promise<PriceComparisonOta> {
    return apiRequest<PriceComparisonOta>(`/api/v1/admin/price-comparison/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  deletePriceComparisonOta(id: number): Promise<void> {
    return apiRequest<void>(`/api/v1/admin/price-comparison/${id}`, { method: 'DELETE' })
  },

  getPriceComparison(params: {
    checkin: string
    checkout: string
    adults: number
    children: number
    rooms?: number
    propertyId?: number
  }): Promise<PriceComparisonResponse> {
    const qs = new URLSearchParams({
      checkin: params.checkin,
      checkout: params.checkout,
      adults: String(params.adults),
      children: String(params.children),
      ...(params.rooms !== undefined && { rooms: String(params.rooms) }),
      ...(params.propertyId !== undefined && { propertyId: String(params.propertyId) }),
    })
    return apiRequest<PriceComparisonResponse>(`/api/v1/price-comparison/results?${qs}`)
  },

  /** Invalidate HyperGuest cache and re-fetch static data for a property */
  syncProperty(propertyId: number): Promise<{ ok: boolean; syncedAt: string }> {
    return apiRequest<{ ok: boolean; syncedAt: string }>(`/api/v1/sync/property/${propertyId}`, {
      method: 'POST',
    })
  },

  /** Update hotel design config (admin) */
  updateHotelConfig(propertyId: number, data: UpdateDesignConfigRequest): Promise<HotelDesignConfig> {
    return apiRequest<HotelDesignConfig>(`/api/v1/config/property/${propertyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /** Get property-level design overrides + org defaults for admin */
  getPropertyDesignAdmin(propertyId: number): Promise<PropertyDesignAdminResponse> {
    return apiRequest<PropertyDesignAdminResponse>(`/api/v1/admin/design/property/${propertyId}`, { cache: 'no-store' })
  },

  getAdminBookings(params: {
    page?: number
    status?: string
    propertyId?: number
    datePivot?: string
    dateFrom?: string
    dateTo?: string
    search?: string
    hasAffiliate?: boolean
    hasPromo?: boolean
    isTest?: boolean
    preset?: string
  }): Promise<AdminBookingsResponse> {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.status) q.set('status', params.status)
    if (params.propertyId) q.set('propertyId', String(params.propertyId))
    if (params.datePivot) q.set('datePivot', params.datePivot)
    if (params.dateFrom) q.set('dateFrom', params.dateFrom)
    if (params.dateTo) q.set('dateTo', params.dateTo)
    if (params.search) q.set('search', params.search)
    if (params.hasAffiliate != null) q.set('hasAffiliate', String(params.hasAffiliate))
    if (params.hasPromo != null) q.set('hasPromo', String(params.hasPromo))
    if (params.isTest != null) q.set('isTest', String(params.isTest))
    if (params.preset) q.set('preset', params.preset)
    const qs = q.toString()
    return apiRequest<AdminBookingsResponse>(`/api/v1/admin/bookings${qs ? `?${qs}` : ''}`)
  },

  /** Get org-level design defaults */
  getGlobalDesignDefaults(): Promise<OrgDesignDefaultsConfig> {
    return apiRequest<OrgDesignDefaultsConfig>('/api/v1/admin/design/global')
  },

  /** Update org-level design defaults */
  updateGlobalDesignDefaults(data: Partial<OrgDesignDefaultsConfig>): Promise<OrgDesignDefaultsConfig> {
    return apiRequest<OrgDesignDefaultsConfig>('/api/v1/admin/design/global', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // ── Admin: Guest Management ─────────────────────────────────────────────────

  listAdminGuests(params: { search?: string; isBlocked?: boolean; page?: number; pageSize?: number }): Promise<AdminGuestsResponse> {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.isBlocked != null) q.set('isBlocked', String(params.isBlocked))
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('pageSize', String(params.pageSize))
    const qs = q.toString()
    return apiRequest<AdminGuestsResponse>(`/api/v1/admin/guests${qs ? `?${qs}` : ''}`)
  },

  getAdminGuest(id: number): Promise<AdminGuestProfile> {
    return apiRequest<AdminGuestProfile>(`/api/v1/admin/guests/${id}`)
  },

  updateAdminGuest(id: number, data: { firstName?: string; lastName?: string; phone?: string | null; nationality?: string | null }): Promise<AdminGuestRow> {
    return apiRequest<AdminGuestRow>(`/api/v1/admin/guests/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  deleteAdminGuest(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/guests/${id}`, { method: 'DELETE' })
  },

  addAdminGuestNote(guestId: number, content: string): Promise<{ id: number; content: string; authorName: string; createdAt: string }> {
    return apiRequest(`/api/v1/admin/guests/${guestId}/notes`, { method: 'POST', body: JSON.stringify({ content }) })
  },

  deleteAdminGuestNote(guestId: number, noteId: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/guests/${guestId}/notes/${noteId}`, { method: 'DELETE' })
  },

  setAdminGuestBlocked(id: number, isBlocked: boolean, reason?: string): Promise<{ id: number; isBlocked: boolean; blockedReason: string | null }> {
    return apiRequest(`/api/v1/admin/guests/${id}/block`, { method: 'PUT', body: JSON.stringify({ isBlocked, reason }) })
  },

  // ── Guest Portal ────────────────────────────────────────────────────────────

  guestRegister(data: { email: string; password: string; firstName: string; lastName: string; phone?: string; nationality?: string; propertyId: number }): Promise<GuestProfile> {
    return apiRequest<GuestProfile>('/api/v1/guest/auth/register', { method: 'POST', body: JSON.stringify(data) })
  },

  guestLogin(email: string, password: string, propertyId: number): Promise<GuestProfile> {
    return apiRequest<GuestProfile>('/api/v1/guest/auth/login', { method: 'POST', body: JSON.stringify({ email, password, propertyId }) })
  },

  guestLogout(): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/guest/auth/logout', { method: 'POST' })
  },

  getGuestAuthProviders(): Promise<{ googleOAuth: boolean }> {
    return apiRequest<{ googleOAuth: boolean }>('/api/v1/guest/auth/providers')
  },

  getGuestMe(): Promise<GuestProfile> {
    return apiRequest<GuestProfile>('/api/v1/guest/me')
  },

  updateGuestMe(data: { firstName?: string; lastName?: string; phone?: string | null; nationality?: string | null; currentPassword?: string; newPassword?: string }): Promise<GuestProfile> {
    return apiRequest<GuestProfile>('/api/v1/guest/me', { method: 'PUT', body: JSON.stringify(data) })
  },

  deleteGuestMe(): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/guest/me', { method: 'DELETE' })
  },

  getGuestBookings(): Promise<GuestBookingSummary[]> {
    return apiRequest<GuestBookingSummary[]>('/api/v1/guest/bookings')
  },

  getGuestBooking(id: number): Promise<GuestBookingDetail> {
    return apiRequest<GuestBookingDetail>(`/api/v1/guest/bookings/${id}`)
  },

  cancelGuestBooking(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/guest/bookings/${id}/cancel`, { method: 'POST' })
  },

  // ── Tracking Pixels ─────────────────────────────────────────────────────────

  listTrackingPixels(): Promise<TrackingPixel[]> {
    return apiRequest<TrackingPixel[]>('/api/v1/admin/pixels')
  },

  createTrackingPixel(data: CreateTrackingPixelRequest): Promise<TrackingPixel> {
    return apiRequest<TrackingPixel>('/api/v1/admin/pixels', { method: 'POST', body: JSON.stringify(data) })
  },

  updateTrackingPixel(id: number, data: UpdateTrackingPixelRequest): Promise<TrackingPixel> {
    return apiRequest<TrackingPixel>(`/api/v1/admin/pixels/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  deleteTrackingPixel(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/pixels/${id}`, { method: 'DELETE' })
  },

  listPropertyTrackingPixels(propertyId: number): Promise<TrackingPixel[]> {
    return apiRequest<TrackingPixel[]>(`/api/v1/admin/properties/${propertyId}/pixels`)
  },

  createPropertyTrackingPixel(propertyId: number, data: CreateTrackingPixelRequest): Promise<TrackingPixel> {
    return apiRequest<TrackingPixel>(`/api/v1/admin/properties/${propertyId}/pixels`, { method: 'POST', body: JSON.stringify(data) })
  },

  getPublicPixels(propertyId: number, page: string): Promise<{ pixels: Array<{ id: number; code: string }> }> {
    return apiRequest<{ pixels: Array<{ id: number; code: string }> }>(`/api/v1/pixels?propertyId=${propertyId}&page=${page}`)
  },

  // ── B2B Auth ────────────────────────────────────────────────────────────────

  b2bLogin(
    email: string,
    password: string,
    sellerSlug: string,
    adminId?: number,
    rememberMe?: boolean,
  ): Promise<
    | { ok: true; organizationId: number; role: string; requiresSelection?: never }
    | { requiresSelection: true; accounts: Array<{ adminId: number; name: string; organizationName: string; role: string }>; ok?: never }
  > {
    return apiRequest('/api/v1/b2b/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, sellerSlug, ...(adminId !== undefined && { adminId }), rememberMe }),
    })
  },

  b2bLogout(): Promise<{ ok: boolean }> {
    return apiRequest('/api/v1/b2b/auth/logout', { method: 'POST' })
  },

  b2bMe(): Promise<{ id: number; email: string; name: string; role: string; organizationId: number; organizationName: string | null; sellerOrgId: number }> {
    return apiRequest('/api/v1/b2b/auth/me')
  },

  b2bBookings(): Promise<Array<{
    id: number; hyperGuestBookingId: number; propertyId: number; status: string
    checkIn: string; checkOut: string; nights: number
    leadGuestFirstName: string; leadGuestLastName: string
    totalAmount: number; currency: string; createdAt: string
    cancellationDeadline: string | null; canCancel: boolean; roomCount: number
  }>> {
    return apiRequest('/api/v1/b2b/bookings')
  },

  b2bGetBooking(id: number): Promise<{
    id: number; hyperGuestBookingId: number; propertyId: number; status: string
    checkIn: string; checkOut: string; nights: number
    leadGuestFirstName: string; leadGuestLastName: string; leadGuestEmail: string
    totalAmount: number; originalPrice: number | null; currency: string
    promoCode: string | null; agencyReference: string | null
    cancellationDeadline: string | null; canCancel: boolean
    cancellationFrames: Array<{ from: string; to: string | null; penaltyAmount: number; currency: string }>
    isRefundable: boolean
    rooms: Array<{ roomCode: string; rateCode: string; board: string; status: string }>
    createdAt: string
  }> {
    return apiRequest(`/api/v1/b2b/bookings/${id}`)
  },

  cancelB2BBooking(id: number): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/b2b/bookings/${id}/cancel`, { method: 'POST' })
  },

  // ── B2B Access Management (super only) ─────────────────────────────────────

  listB2BAccess(): Promise<Array<{
    id: number
    buyerOrgId: number
    sellerOrgId: number
    createdAt: string
    buyerOrg: { id: number; name: string; slug: string }
    sellerOrg: { id: number; name: string; slug: string }
  }>> {
    return apiRequest('/api/v1/admin/super/b2b-access')
  },

  createB2BAccess(buyerOrgId: number, sellerOrgId: number): Promise<{
    id: number
    buyerOrg: { id: number; name: string; slug: string }
    sellerOrg: { id: number; name: string; slug: string }
  }> {
    return apiRequest('/api/v1/admin/super/b2b-access', {
      method: 'POST',
      body: JSON.stringify({ buyerOrgId, sellerOrgId }),
    })
  },

  deleteB2BAccess(id: number): Promise<void> {
    return apiRequest(`/api/v1/admin/super/b2b-access/${id}`, { method: 'DELETE' })
  },

  // ── Marketing Module Settings ───────────────────────────────────────────────

  getOrgMarketingSettings(): Promise<MarketingSettings> {
    return apiRequest('/api/v1/admin/marketing/settings')
  },

  updateOrgMarketingSettings(data: UpdateMarketingSettingsRequest): Promise<MarketingSettings> {
    return apiRequest('/api/v1/admin/marketing/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  getPropertyMarketingSettings(propertyId: number): Promise<PropertyMarketingSettingsResponse> {
    return apiRequest(`/api/v1/admin/marketing/settings/property/${propertyId}`)
  },

  updatePropertyMarketingSettings(propertyId: number, data: UpdatePropertyMarketingSettingsRequest): Promise<PropertyMarketingSettingsResponse> {
    return apiRequest(`/api/v1/admin/marketing/settings/property/${propertyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  getEffectiveMarketingSettings(propertyId: number): Promise<MarketingSettings> {
    return apiRequest(`/api/v1/marketing/settings/effective?propertyId=${propertyId}`)
  },
}

export { ApiClientError }
