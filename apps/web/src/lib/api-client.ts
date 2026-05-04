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
  GlobalDesignAdminResponse,
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
  SendAdminCredentialsRequest,
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
  AIProvider,
  AIConfigResponse,
  OrgAIConfigResponse,
  PropertyAIConfigResponse,
  AIConfigUpdate,
  OrgAIConfigUpdate,
  PropertyAIConfigUpdate,
  AITestResult,
  AIChannelSettings,
  UpdateAIChannelSettingsRequest,
  MapsConfigResponse,
  MapsConfigUpdate,
  WeatherConfigResponse,
  WeatherConfigUpdate,
  EventsConfigResponse,
  EventsConfigUpdate,
  PropertyEmailSettingsResponse,
  UpdatePropertyEmailSettingsRequest,
  PropertyWhatsAppSettingsResponse,
  UpdatePropertyWhatsAppSettingsRequest,
  AffiliateMarketplaceEntry,
  AffiliatePortalBooking,
  AffiliatePortalStats,
  AffiliateRegisterRequest,
  AffiliateProfile,
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

  sendBookingConfirmation(
    bookingId: string | number,
    channel: 'email' | 'whatsapp',
    to: string,
    inline?: {
      propertyId?: number
      guestName?: string
      checkIn?: string
      checkOut?: string
      totalAmount?: number
      currency?: string
      hyperGuestBookingId?: number
      rooms?: Array<{ roomCode: string; board: string }>
      selectedRooms?: Array<{
        roomName: string
        nightlyBreakdown: Array<{ date: string; sell: number; currency: string }>
        sellTaxes: Array<{ description: string; amount: number; currency: string; relation: string }>
        fees: Array<{ description: string; amount: number; currency: string; relation: string }>
      }>
    },
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/bookings/${bookingId}/send-confirmation`, {
      method: 'POST',
      body: JSON.stringify({ channel, to, ...inline }),
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
  getChainImages(orgId?: number): Promise<ChainImagesResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest<ChainImagesResponse>(`/api/v1/admin/design/chain-images${qs}`)
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

  getOrgSettings(orgId?: number): Promise<OrgSettingsResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest<OrgSettingsResponse>(`/api/v1/admin/org${qs}`)
  },

  getB2BConnections(): Promise<{
    asSeller: Array<{ id: number; org: { id: number; name: string; slug: string } }>
    asBuyer: Array<{ id: number; org: { id: number; name: string; slug: string } }>
  }> {
    return apiRequest('/api/v1/admin/b2b-connections')
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

  getPropertyOrgs(propertyDbId: number): Promise<import('@ibe/shared').PropertyOrgInfo[]> {
    return apiRequest(`/api/v1/admin/super/properties/${propertyDbId}/orgs`)
  },

  addOrgToProperty(propertyDbId: number, orgId: number): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/super/properties/${propertyDbId}/orgs`, {
      method: 'POST',
      body: JSON.stringify({ orgId }),
    })
  },

  removeOrgFromProperty(propertyDbId: number, orgId: number): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/super/properties/${propertyDbId}/orgs/${orgId}`, { method: 'DELETE' })
  },

  transferPrimaryOwnership(propertyDbId: number, orgId: number): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/super/properties/${propertyDbId}/orgs/${orgId}/transfer-primary`, { method: 'PUT' })
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
    creds: { bearerToken?: string | undefined; staticDomain?: string | undefined; searchDomain?: string | undefined; bookingDomain?: string | undefined },
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

  getOnsiteConversionGlobal(orgId?: number | null): Promise<OnsiteConversionSettings> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest<OnsiteConversionSettings>(`/api/v1/admin/onsite-conversion/global${qs}`)
  },

  updateOnsiteConversionGlobal(data: UpdateOnsiteConversionRequest, orgId?: number | null): Promise<OnsiteConversionSettings> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest<OnsiteConversionSettings>(`/api/v1/admin/onsite-conversion/global${qs}`, {
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

  listAdminUsers(onlyDeleted = false): Promise<AdminUserRecord[]> {
    const qs = onlyDeleted ? '?includeDeleted=true' : ''
    return apiRequest<AdminUserRecord[]>(`/api/v1/admin/users${qs}`)
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

  reviveAdminUser(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/users/${id}/revive`, { method: 'POST' })
  },

  sendAdminCredentials(data: SendAdminCredentialsRequest): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/admin/users/send-credentials', { method: 'POST', body: JSON.stringify(data) })
  },

  getDashboardStats(orgId?: number, days = 14, propertyId?: number): Promise<import('@ibe/shared').DashboardStats> {
    const qs = new URLSearchParams({ days: String(days) })
    if (orgId) qs.set('orgId', String(orgId))
    if (propertyId) qs.set('propertyId', String(propertyId))
    return apiRequest(`/api/v1/admin/dashboard/stats?${qs}`)
  },

  listOrgs(onlyDeleted = false): Promise<OrgRecord[]> {
    const qs = onlyDeleted ? '?includeDeleted=true' : ''
    return apiRequest<OrgRecord[]>(`/api/v1/admin/super/orgs${qs}`)
  },

  createOrg(data: CreateOrgRequest): Promise<OrgRecord> {
    return apiRequest<OrgRecord>('/api/v1/admin/super/orgs', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updateOrg(orgId: number, data: { name?: string; hyperGuestOrgId?: string | null; orgType?: string; hyperGuestBearerToken?: string | null }): Promise<OrgRecord> {
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

  reviveOrg(orgId: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/api/v1/admin/super/orgs/${orgId}/revive`, { method: 'POST' })
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

  getCommunicationSettings(orgId?: number): Promise<CommunicationSettingsResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest<CommunicationSettingsResponse>(`/api/v1/admin/communication${qs}`)
  },

  updateCommunicationSettings(data: UpdateCommunicationSettingsRequest & { orgId?: number }): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/admin/communication', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  getSystemCommunicationSettings(): Promise<CommunicationSettingsResponse> {
    return apiRequest<CommunicationSettingsResponse>('/api/v1/admin/communication/system')
  },

  updateSystemCommunicationSettings(data: UpdateCommunicationSettingsRequest): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>('/api/v1/admin/communication/system', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  getWhatsAppWebhookInfo(): Promise<{ webhookUrl: string; verifyToken: string }> {
    return apiRequest<{ webhookUrl: string; verifyToken: string }>('/api/v1/admin/communication/whatsapp-webhook')
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

  /** Get public system meta (tab title, favicon, logo) — no auth required */
  getSystemMeta(): Promise<{ displayName: string | null; tabTitle: string | null; faviconUrl: string | null; logoUrl: string | null }> {
    return apiRequest('/api/v1/config/system-meta')
  },

  /** Get system-level design defaults (super admin only) */
  getSystemDesignDefaults(): Promise<OrgDesignDefaultsConfig> {
    return apiRequest<OrgDesignDefaultsConfig>('/api/v1/admin/design/system')
  },

  /** Update system-level design defaults (super admin only) */
  updateSystemDesignDefaults(data: Partial<OrgDesignDefaultsConfig>): Promise<OrgDesignDefaultsConfig> {
    return apiRequest<OrgDesignDefaultsConfig>('/api/v1/admin/design/system', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /** Get translation AI config (inherit vs custom provider) */
  getTranslationAIConfig(): Promise<import('@ibe/shared').TranslationAIConfigResponse> {
    return apiRequest('/api/v1/admin/design/translations/ai-config')
  },

  /** Update translation AI config */
  updateTranslationAIConfig(data: import('@ibe/shared').TranslationAIConfigUpdate): Promise<import('@ibe/shared').TranslationAIConfigResponse> {
    return apiRequest('/api/v1/admin/design/translations/ai-config', { method: 'PUT', body: JSON.stringify(data) })
  },

  /** AI-translate a single string and save it */
  translateOneString(locale: string, namespace: string, key: string): Promise<{ value: string }> {
    return apiRequest('/api/v1/admin/design/translations/translate-one', {
      method: 'POST',
      body: JSON.stringify({ locale, namespace, key }),
    })
  },

  /** Get translation status (per-locale, per-namespace counts) */
  getTranslationStatus(): Promise<import('@ibe/shared').TranslationStatusResponse> {
    return apiRequest('/api/v1/admin/design/translations/status')
  },

  /** Get total count of English source strings */
  getTranslationTotal(): Promise<{ total: number }> {
    return apiRequest('/api/v1/admin/design/translations/total')
  },

  /** List translation rows for a locale + namespace */
  getTranslationRows(locale: string, namespace: string): Promise<import('@ibe/shared').TranslationRow[]> {
    return apiRequest(`/api/v1/admin/design/translations/${encodeURIComponent(locale)}/${encodeURIComponent(namespace)}`)
  },

  /** Upsert a single translation */
  upsertTranslation(locale: string, namespace: string, key: string, value: string): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/design/translations/${encodeURIComponent(locale)}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    })
  },

  /** Delete all translations for a locale */
  deleteTranslationsForLocale(locale: string): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/design/translations/${encodeURIComponent(locale)}`, { method: 'DELETE' })
  },

  /** Get org-level design defaults + system defaults for inheritance display */
  getGlobalDesignDefaults(orgId?: number): Promise<GlobalDesignAdminResponse> {
    const q = orgId != null ? `?orgId=${orgId}` : ''
    return apiRequest<GlobalDesignAdminResponse>(`/api/v1/admin/design/global${q}`)
  },

  /** Update org-level design defaults */
  updateGlobalDesignDefaults(data: Partial<OrgDesignDefaultsConfig>, orgId?: number): Promise<GlobalDesignAdminResponse> {
    const q = orgId != null ? `?orgId=${orgId}` : ''
    return apiRequest<GlobalDesignAdminResponse>(`/api/v1/admin/design/global${q}`, {
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

  updateAdminGuest(id: number, data: { firstName?: string | undefined; lastName?: string | undefined; phone?: string | null | undefined; nationality?: string | null | undefined }): Promise<AdminGuestRow> {
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

  getSellerConfig(slug: string): Promise<{ logoUrl: string | null; displayName: string | null }> {
    return apiRequest(`/api/v1/config/seller/${encodeURIComponent(slug)}`)
  },

  // ── B2B Auth ────────────────────────────────────────────────────────────────

  b2bLogin(
    email: string,
    password: string,
    sellerSlug: string,
    adminId?: number,
    rememberMe?: boolean,
  ): Promise<
    | { ok: true; organizationId: number; role: string; mustChangePassword?: boolean; requiresSelection?: never }
    | { requiresSelection: true; accounts: Array<{ adminId: number; name: string; organizationName: string; role: string }>; ok?: never }
  > {
    return apiRequest('/api/v1/b2b/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, sellerSlug, ...(adminId !== undefined && { adminId }), rememberMe }),
    })
  },

  b2bChangePassword(newPassword: string): Promise<{ ok: boolean }> {
    return apiRequest('/api/v1/b2b/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ newPassword }),
    })
  },

  b2bLogout(): Promise<{ ok: boolean }> {
    return apiRequest('/api/v1/b2b/auth/logout', { method: 'POST' })
  },

  b2bMe(): Promise<{ id: number; email: string; name: string; role: string; organizationId: number; organizationName: string | null; sellerOrgId: number; mustChangePassword: boolean }> {
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

  // ── AI Configuration ────────────────────────────────────────────────────────

  isAIEnabled(propertyId?: number): Promise<{ enabled: boolean }> {
    const qs = propertyId ? `?propertyId=${propertyId}` : ''
    return apiRequest(`/api/v1/ai/enabled${qs}`)
  },

  getChatConfig(propertyId?: number): Promise<{ aiEnabled: boolean; whatsappNumber: string | null; name: string | null }> {
    const qs = propertyId ? `?propertyId=${propertyId}` : ''
    return apiRequest(`/api/v1/ai/chat-config${qs}`)
  },

  getSystemAIConfig(): Promise<AIConfigResponse> {
    return apiRequest('/api/v1/admin/ai/system')
  },

  updateSystemAIConfig(data: AIConfigUpdate): Promise<AIConfigResponse> {
    return apiRequest('/api/v1/admin/ai/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  getOrgAIConfig(orgId?: number): Promise<OrgAIConfigResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/ai/org${qs}`)
  },

  updateOrgAIConfig(data: OrgAIConfigUpdate & { orgId?: number }): Promise<OrgAIConfigResponse> {
    return apiRequest('/api/v1/admin/ai/org', { method: 'PUT', body: JSON.stringify(data) })
  },

  getPropertyAIConfig(propertyId: number): Promise<PropertyAIConfigResponse> {
    return apiRequest(`/api/v1/admin/ai/property/${propertyId}`)
  },

  updatePropertyAIConfig(propertyId: number, data: PropertyAIConfigUpdate): Promise<PropertyAIConfigResponse> {
    return apiRequest(`/api/v1/admin/ai/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  testAIConnection(provider: AIProvider, apiKey: string, model: string): Promise<AITestResult> {
    return apiRequest('/api/v1/admin/ai/test', { method: 'POST', body: JSON.stringify({ provider, apiKey, model }) })
  },

  testStoredAIConnection(level: 'system' | 'org' | 'property', opts?: { orgId?: number; propertyId?: number }): Promise<AITestResult> {
    return apiRequest('/api/v1/admin/ai/test-stored', { method: 'POST', body: JSON.stringify({ level, ...opts }) })
  },

  // ── AI Channels ─────────────────────────────────────────────────────────────

  getOrgAIChannels(orgId?: number): Promise<AIChannelSettings> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/ai/channels${qs}`)
  },

  updateOrgAIChannels(data: UpdateAIChannelSettingsRequest, orgId?: number): Promise<AIChannelSettings> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/ai/channels${qs}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // ── Maps ─────────────────────────────────────────────────────────────────────

  getSystemMapsConfig(): Promise<MapsConfigResponse> {
    return apiRequest('/api/v1/admin/maps/config/system')
  },

  updateSystemMapsConfig(data: MapsConfigUpdate): Promise<MapsConfigResponse> {
    return apiRequest('/api/v1/admin/maps/config/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  getMapsConfig(orgId?: number): Promise<MapsConfigResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/maps/config${qs}`)
  },

  updateMapsConfig(data: MapsConfigUpdate, orgId?: number): Promise<MapsConfigResponse> {
    const body = orgId ? { ...data, orgId } : data
    return apiRequest('/api/v1/admin/maps/config', { method: 'PUT', body: JSON.stringify(body) })
  },

  testMapsConnection(orgId?: number): Promise<{ ok: boolean; error?: string }> {
    return apiRequest('/api/v1/admin/maps/test', { method: 'POST', body: JSON.stringify({ orgId }) })
  },

  testEmailConnection(orgId?: number): Promise<{ ok: boolean; error?: string }> {
    return apiRequest('/api/v1/admin/communication/email/test', { method: 'POST', body: JSON.stringify({ orgId }) })
  },

  testWhatsappConnection(orgId?: number): Promise<{ ok: boolean; error?: string }> {
    return apiRequest('/api/v1/admin/communication/whatsapp/test', { method: 'POST', body: JSON.stringify({ orgId }) })
  },

  getWebjsStatus(orgId?: number): Promise<{ status: 'disconnected' | 'qr' | 'connected'; phoneNumber?: string }> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/communication/wwebjs/status${qs}`)
  },

  getWebjsQr(orgId?: number): Promise<{ qr: string }> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/communication/wwebjs/qr${qs}`)
  },

  disconnectWwebjs(orgId?: number): Promise<{ ok: boolean }> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/communication/wwebjs/disconnect${qs}`, { method: 'POST' })
  },

  getPropertyWebjsSettings(propertyId: number): Promise<{ whatsappWebjsServiceUrl: string; whatsappSystemServiceDisabled: boolean; inheritedProvider: string | null; inheritedWebjsUrl: string | null; inheritedDisabled: boolean }> {
    return apiRequest(`/api/v1/admin/communication/property/wwebjs?propertyId=${propertyId}`)
  },

  updatePropertyWebjsSettings(propertyId: number, data: { whatsappWebjsServiceUrl?: string; whatsappSystemServiceDisabled?: boolean }): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/communication/property/wwebjs?propertyId=${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  getPropertyWebjsStatus(propertyId: number, orgId?: number): Promise<{ status: 'disconnected' | 'qr' | 'connected'; phoneNumber?: string }> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/wwebjs/status?${qs}`)
  },

  getPropertyWebjsQr(propertyId: number, orgId?: number): Promise<{ qr: string }> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/wwebjs/qr?${qs}`)
  },

  disconnectPropertyWwebjs(propertyId: number, orgId?: number): Promise<{ ok: boolean }> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/wwebjs/disconnect?${qs}`, { method: 'POST' })
  },

  sendWebjsTestMessage(to: string, orgId?: number): Promise<{ ok: boolean; error?: string }> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/communication/wwebjs/send-test${qs}`, { method: 'POST', body: JSON.stringify({ to }) })
  },

  sendPropertyWebjsTestMessage(to: string, propertyId: number, orgId?: number): Promise<{ ok: boolean; error?: string }> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/wwebjs/send-test?${qs}`, { method: 'POST', body: JSON.stringify({ to }) })
  },

  getPropertyEmailSettings(propertyId: number, orgId?: number): Promise<PropertyEmailSettingsResponse> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/email?${qs}`)
  },

  updatePropertyEmailSettings(propertyId: number, data: UpdatePropertyEmailSettingsRequest, orgId?: number): Promise<PropertyEmailSettingsResponse> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/email?${qs}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  testPropertyEmailConnection(propertyId: number, orgId?: number): Promise<{ ok: boolean; error?: string }> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/email/test?${qs}`, { method: 'POST' })
  },

  getPropertyWhatsAppSettings(propertyId: number, orgId?: number): Promise<PropertyWhatsAppSettingsResponse> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/whatsapp?${qs}`)
  },

  updatePropertyWhatsAppSettings(propertyId: number, data: UpdatePropertyWhatsAppSettingsRequest, orgId?: number): Promise<PropertyWhatsAppSettingsResponse> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/whatsapp?${qs}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  testPropertyWhatsAppConnection(propertyId: number, orgId?: number): Promise<{ ok: boolean; error?: string }> {
    const qs = new URLSearchParams({ propertyId: String(propertyId), ...(orgId ? { orgId: String(orgId) } : {}) }).toString()
    return apiRequest(`/api/v1/admin/communication/property/whatsapp/test?${qs}`, { method: 'POST' })
  },

  // ── Weather ───────────────────────────────────────────────────────────────────

  getSystemWeatherConfig(): Promise<WeatherConfigResponse> {
    return apiRequest('/api/v1/admin/weather/config/system')
  },

  updateSystemWeatherConfig(data: WeatherConfigUpdate): Promise<WeatherConfigResponse> {
    return apiRequest('/api/v1/admin/weather/config/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  getWeatherConfig(orgId?: number): Promise<WeatherConfigResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/weather/config${qs}`)
  },

  updateWeatherConfig(data: WeatherConfigUpdate, orgId?: number): Promise<WeatherConfigResponse> {
    const body = orgId ? { ...data, orgId } : data
    return apiRequest('/api/v1/admin/weather/config', { method: 'PUT', body: JSON.stringify(body) })
  },

  // ── Events ────────────────────────────────────────────────────────────────────

  getSystemEventsConfig(): Promise<EventsConfigResponse> {
    return apiRequest('/api/v1/admin/events/config/system')
  },

  updateSystemEventsConfig(data: EventsConfigUpdate): Promise<EventsConfigResponse> {
    return apiRequest('/api/v1/admin/events/config/system', { method: 'PUT', body: JSON.stringify(data) })
  },

  getEventsConfig(orgId?: number): Promise<EventsConfigResponse> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/events/config${qs}`)
  },

  updateEventsConfig(data: EventsConfigUpdate, orgId?: number): Promise<EventsConfigResponse> {
    const body = orgId ? { ...data, orgId } : data
    return apiRequest('/api/v1/admin/events/config', { method: 'PUT', body: JSON.stringify(body) })
  },

  testEventsConnection(orgId?: number): Promise<{ ok: boolean; error?: string }> {
    return apiRequest('/api/v1/admin/events/test', { method: 'POST', body: JSON.stringify({ orgId }) })
  },

  // ── Cross-Sell ───────────────────────────────────────────────────────────────

  getCrossSellConfig(orgId?: number): Promise<import('@ibe/shared').CrossSellConfig> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/cross-sell/config${qs}`)
  },

  updateCrossSellConfig(data: import('@ibe/shared').CrossSellConfigUpdate, orgId?: number): Promise<import('@ibe/shared').CrossSellConfig> {
    const body = orgId ? { ...data, orgId } : data
    return apiRequest('/api/v1/admin/cross-sell/config', { method: 'PUT', body: JSON.stringify(body) })
  },

  createCrossSellProduct(data: import('@ibe/shared').CrossSellProductCreate, orgId?: number): Promise<import('@ibe/shared').CrossSellProduct> {
    const body = orgId ? { ...data, orgId } : data
    return apiRequest('/api/v1/admin/cross-sell/products', { method: 'POST', body: JSON.stringify(body) })
  },

  updateCrossSellProduct(id: number, data: import('@ibe/shared').CrossSellProductUpdate, orgId?: number): Promise<import('@ibe/shared').CrossSellProduct> {
    const body = orgId ? { ...data, orgId } : data
    return apiRequest(`/api/v1/admin/cross-sell/products/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  },

  deleteCrossSellProduct(id: number, orgId?: number): Promise<void> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/cross-sell/products/${id}${qs}`, { method: 'DELETE' })
  },

  getPropertyCrossSellOverride(propertyId: number): Promise<{ enabled: boolean | null; paymentMode: string | null }> {
    return apiRequest(`/api/v1/admin/cross-sell/property/${propertyId}`)
  },

  updatePropertyCrossSellOverride(propertyId: number, data: { enabled?: boolean | null; paymentMode?: string | null }): Promise<{ enabled: boolean | null; paymentMode: string | null }> {
    return apiRequest(`/api/v1/admin/cross-sell/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  getPublicCrossSell(propertyId: number): Promise<import('@ibe/shared').PublicCrossellResponse> {
    return apiRequest(`/api/v1/cross-sell/${propertyId}`)
  },

  // ── MCP ──────────────────────────────────────────────────────────────────────

  getOrgMcpConfig(orgId?: number): Promise<{ enabled: boolean; apiKey: string | null }> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/ai/mcp${qs}`)
  },

  getPropertyMcpConfig(propertyId: number): Promise<{ enabled: boolean; apiKey: string | null }> {
    return apiRequest(`/api/v1/admin/ai/mcp/property/${propertyId}`)
  },

  updateMcpConfig(data: { enabled: boolean; orgId?: number; propertyId?: number }): Promise<{ enabled: boolean; apiKey: string }> {
    return apiRequest('/api/v1/admin/ai/mcp', { method: 'PUT', body: JSON.stringify(data) })
  },

  rotateMcpApiKey(data: { orgId?: number; propertyId?: number }): Promise<{ enabled: boolean; apiKey: string }> {
    return apiRequest('/api/v1/admin/ai/mcp/rotate', { method: 'POST', body: JSON.stringify(data) })
  },

  getSystemMcpConfig(): Promise<{ enabled: boolean }> {
    return apiRequest('/api/v1/admin/ai/mcp/system')
  },

  updateSystemMcpConfig(enabled: boolean): Promise<{ enabled: boolean }> {
    return apiRequest('/api/v1/admin/ai/mcp/system', { method: 'PUT', body: JSON.stringify({ enabled }) })
  },

  getMcpOAuthConfig(orgId?: number): Promise<{ issuer: string; authorizeUrl: string; tokenUrl: string; jwksUrl: string; discoveryUrl: string; registerUrl: string; mcpUrl: string; claude: { clientId: string; clientSecret: string } }> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/ai/mcp/oauth/config${qs}`)
  },

  rotateClaudeClientSecret(orgId?: number): Promise<{ clientId: string; clientSecret: string }> {
    return apiRequest('/api/v1/admin/ai/mcp/oauth/claude/rotate', { method: 'POST', body: JSON.stringify(orgId ? { orgId } : {}) })
  },

  // ── Groups ────────────────────────────────────────────────────────────────

  getGroupConfig(orgId?: number): Promise<import('@ibe/shared').GroupConfig> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/admin/groups/config${qs}`)
  },

  updateGroupConfig(data: import('@ibe/shared').GroupConfigUpdate, orgId?: number): Promise<import('@ibe/shared').GroupConfig> {
    return apiRequest('/api/v1/admin/groups/config', { method: 'PUT', body: JSON.stringify({ ...data, ...(orgId !== undefined ? { orgId } : {}) }) })
  },

  getPropertyGroupOverride(propertyId: number): Promise<import('@ibe/shared').GroupPropertyOverride> {
    return apiRequest(`/api/v1/admin/groups/property/${propertyId}`)
  },

  updatePropertyGroupOverride(propertyId: number, data: Partial<import('@ibe/shared').GroupPropertyOverride>): Promise<import('@ibe/shared').GroupPropertyOverride> {
    return apiRequest(`/api/v1/admin/groups/property/${propertyId}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  getPublicGroupConfig(propertyId: number, orgId?: number | null): Promise<import('@ibe/shared').PublicGroupConfig> {
    const qs = orgId ? `?orgId=${orgId}` : ''
    return apiRequest(`/api/v1/groups/config/${propertyId}${qs}`)
  },

  submitGroupInquiry(data: import('@ibe/shared').GroupInquiryRequest): Promise<{ ok: boolean; guestEmailSent: boolean }> {
    return apiRequest('/api/v1/groups/inquiry', { method: 'POST', body: JSON.stringify(data) })
  },

  // ── Incentives ────────────────────────────────────────────────────────────

  listIncentiveItems(orgId?: number | null, hotelView = false, propertyId?: number): Promise<import('@ibe/shared').IncentiveItem[]> {
    const params = new URLSearchParams()
    if (orgId != null) params.set('orgId', String(orgId))
    if (hotelView) params.set('hotelView', 'true')
    if (propertyId != null) params.set('propertyId', String(propertyId))
    const qs = params.toString() ? `?${params}` : ''
    return apiRequest(`/api/v1/admin/incentives/items${qs}`)
  },

  createIncentiveItem(data: import('@ibe/shared').CreateIncentiveItemRequest & { orgId?: number | null }): Promise<import('@ibe/shared').IncentiveItem> {
    return apiRequest('/api/v1/admin/incentives/items', { method: 'POST', body: JSON.stringify(data) })
  },

  updateIncentiveItem(id: number, data: import('@ibe/shared').UpdateIncentiveItemRequest, orgId?: number | null, propertyId?: number): Promise<import('@ibe/shared').IncentiveItem> {
    const params = new URLSearchParams()
    if (orgId != null) params.set('orgId', String(orgId))
    if (propertyId != null) params.set('propertyId', String(propertyId))
    const qs = params.toString() ? `?${params}` : ''
    return apiRequest(`/api/v1/admin/incentives/items/${id}${qs}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  deleteIncentiveItem(id: number, orgId?: number | null, propertyId?: number): Promise<void> {
    const params = new URLSearchParams()
    if (orgId != null) params.set('orgId', String(orgId))
    if (propertyId != null) params.set('propertyId', String(propertyId))
    const qs = params.toString() ? `?${params}` : ''
    return apiRequest(`/api/v1/admin/incentives/items/${id}${qs}`, { method: 'DELETE' })
  },

  listIncentivePackages(orgId?: number | null, hotelView = false, propertyId?: number): Promise<import('@ibe/shared').IncentivePackage[]> {
    const params = new URLSearchParams()
    if (orgId != null) params.set('orgId', String(orgId))
    if (hotelView) params.set('hotelView', 'true')
    if (propertyId != null) params.set('propertyId', String(propertyId))
    const qs = params.toString() ? `?${params}` : ''
    return apiRequest(`/api/v1/admin/incentives/packages${qs}`)
  },

  createIncentivePackage(data: import('@ibe/shared').CreateIncentivePackageRequest): Promise<import('@ibe/shared').IncentivePackage> {
    return apiRequest('/api/v1/admin/incentives/packages', { method: 'POST', body: JSON.stringify(data) })
  },

  updateIncentivePackage(id: number, data: import('@ibe/shared').UpdateIncentivePackageRequest, orgId?: number | null, propertyId?: number): Promise<import('@ibe/shared').IncentivePackage> {
    const params = new URLSearchParams()
    if (orgId != null) params.set('orgId', String(orgId))
    if (propertyId != null) params.set('propertyId', String(propertyId))
    const qs = params.toString() ? `?${params}` : ''
    return apiRequest(`/api/v1/admin/incentives/packages/${id}${qs}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  deleteIncentivePackage(id: number, orgId?: number | null, propertyId?: number): Promise<void> {
    const params = new URLSearchParams()
    if (orgId != null) params.set('orgId', String(orgId))
    if (propertyId != null) params.set('propertyId', String(propertyId))
    const qs = params.toString() ? `?${params}` : ''
    return apiRequest(`/api/v1/admin/incentives/packages/${id}${qs}`, { method: 'DELETE' })
  },

  getIncentiveSlots(orgId?: number | null, propertyId?: number): Promise<import('@ibe/shared').IncentiveSlotConfig[]> {
    const qs = new URLSearchParams()
    if (orgId != null) qs.set('orgId', String(orgId))
    if (propertyId != null) qs.set('propertyId', String(propertyId))
    const q = qs.toString()
    return apiRequest(`/api/v1/admin/incentives/slots${q ? '?' + q : ''}`)
  },

  setIncentiveSlot(slot: import('@ibe/shared').IncentiveSlotName, data: { packageId?: number | null; orgId?: number | null; propertyId?: number }): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/incentives/slots/${slot}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  getIncentiveForProperty(propertyId: number): Promise<import('@ibe/shared').IncentiveSlots> {
    return apiRequest(`/api/v1/incentives/property/${propertyId}`)
  },

  getChainIncentive(orgId: number): Promise<import('@ibe/shared').IncentiveSlots> {
    return apiRequest(`/api/v1/incentives/chain?orgId=${orgId}`)
  },

  setChainItemOverride(itemId: number, orgId: number, disabled: boolean): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/incentives/items/${itemId}/chain-override`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, disabled }),
    })
  },

  setPropertyItemOverride(itemId: number, propertyId: number, disabled: boolean): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/incentives/items/${itemId}/property-override`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId, disabled }),
    })
  },

  getIncentiveChainConfig(orgId: number): Promise<import('@ibe/shared').IncentiveChainConfig> {
    return apiRequest(`/api/v1/admin/incentives/chain-config?orgId=${orgId}`)
  },

  setIncentiveChainEnabled(orgId: number, incentivesEnabled: boolean): Promise<import('@ibe/shared').IncentiveChainConfig> {
    return apiRequest('/api/v1/admin/incentives/chain-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, incentivesEnabled }),
    })
  },

  // Incentive item translations
  listIncentiveItemTranslations(locale: string, orgId?: number | null, propertyId?: number): Promise<{ id: number; text: string; value: string | null }[]> {
    const params = new URLSearchParams()
    if (orgId != null) params.set('orgId', String(orgId))
    if (propertyId != null) params.set('propertyId', String(propertyId))
    const qs = params.toString() ? `?${params}` : ''
    return apiRequest(`/api/v1/admin/incentives/translations/${locale}${qs}`)
  },

  upsertIncentiveItemTranslation(locale: string, itemId: number, value: string): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/admin/incentives/translations/${locale}/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    })
  },

  aiTranslateIncentiveItem(locale: string, itemId: number, text: string): Promise<{ value: string }> {
    return apiRequest(`/api/v1/admin/incentives/translations/${locale}/${itemId}/ai-translate`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  },

  // ── Affiliate Portal ───────────────────────────────────────────────────────

  affiliateRegister(data: AffiliateRegisterRequest): Promise<{ ok: boolean; message: string }> {
    return apiRequest('/api/v1/affiliate/register', { method: 'POST', body: JSON.stringify(data) })
  },

  affiliateMe(): Promise<{ id: number; email: string; name: string; stats: AffiliatePortalStats }> {
    return apiRequest('/api/v1/affiliate/me', { cache: 'no-store' })
  },

  affiliateMarketplace(): Promise<AffiliateMarketplaceEntry[]> {
    return apiRequest('/api/v1/affiliate/marketplace', { cache: 'no-store' })
  },

  affiliateJoin(propertyId: number): Promise<{ ok: boolean; affiliateId: number; code: string }> {
    return apiRequest(`/api/v1/affiliate/marketplace/${propertyId}`, { method: 'POST' })
  },

  affiliateBookings(): Promise<AffiliatePortalBooking[]> {
    return apiRequest('/api/v1/affiliate/bookings', { cache: 'no-store' })
  },

  affiliateProfile(): Promise<AffiliateProfile> {
    return apiRequest('/api/v1/affiliate/profile', { cache: 'no-store' })
  },

  affiliateUpdateProfile(data: Partial<AffiliateProfile>): Promise<{ ok: boolean }> {
    return apiRequest('/api/v1/affiliate/profile', { method: 'PUT', body: JSON.stringify(data) })
  },

  affiliateAcceptTerms(): Promise<{ ok: boolean }> {
    return apiRequest('/api/v1/affiliate/terms', { method: 'POST' })
  },

  affiliateLinks(): Promise<{
    id: number; code: string; propertyId: number | null; propertyName: string | null
    commissionRate: number | null; discountRate: number | null; status: string; url: string; createdAt: string
  }[]> {
    return apiRequest('/api/v1/affiliate/links', { cache: 'no-store' })
  },
}

export { ApiClientError }
