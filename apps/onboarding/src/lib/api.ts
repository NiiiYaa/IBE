const BASE = process.env.NEXT_PUBLIC_ONBOARDING_API_URL ?? 'http://localhost:3003';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  initSession: (token: string) => request<{ ok: boolean; sessionId: number }>('POST', '/session', { token }),
  register: (data: { hotelName: string; pmsId: number; contactEmail: string; websiteUrl?: string }) =>
    request<{ ok: boolean; sessionId: number }>('POST', '/register', data),
  getState: () => request<WizardState>('GET', '/wizard/state'),
  submitCredentials: (credentials: Record<string, string>) =>
    request<{ ok: boolean }>('POST', '/wizard/submit-credentials', { credentials }),
  confirmReview: (enrichedData: Record<string, unknown>) =>
    request<{ ok: boolean }>('POST', '/wizard/confirm-review', { enrichedData }),
  addRoomManually: (data: { name: string; maxAdults: number; maxOccupancy: number; bedConfiguration: string }) =>
    request<{ ok: boolean }>('POST', '/wizard/add-room-manually', data),
  extendHarvestUrl: () => `${BASE}/wizard/extend-harvest`,
  submitCmSettings: (cmSettings: CmSettingsPayload) =>
    request<{ ok: boolean }>('POST', '/wizard/submit-cm-settings', { cmSettings }),
};

export interface RatePlanRow {
  boardCode: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  boardCodeRawName: string;
  isRefundable: boolean;
  pmsRateplanCode: string;
  priceType: 'gross' | 'net';
  commissionPercent: number;
  charge: 'agent' | 'customer';
  cancellationPolicy: unknown | null;
}

export interface CmSettingsPayload {
  currency: string;
  pricingModel: 'per_room' | 'per_occupancy' | 'per_person';
  ratePlans: RatePlanRow[];
  taxRelations: Record<string, string>;
}

export interface WizardState {
  sessionId: number;
  pmsId: number | null;
  pmsName: string | null;
  dataFlow: 'hg_pulls' | 'blank' | 'reverse_pull' | null;
  currentStep: number;
  totalSteps: number;
  steps: Array<{ id: string; kind: string; title: string; description: string; status: string }>;
  enrichedData: Record<string, unknown> | null;
  harvestedRooms: Array<{ name: string; description: string }> | null;
  harvestedRatePlanTypes: Array<{
    boardCode: string; boardCodeRawName: string;
    hasRefundable: boolean; hasNonRefundable: boolean;
    refundableExampleName: string | null;
    refundableCancellationPolicy: unknown | null;
  }> | null;
  harvestedTaxes: Array<{ name: string; amount: string | null; notes: string | null; source: string }> | null;
  hgPropertyCode: string | null;
  status: string;
}
