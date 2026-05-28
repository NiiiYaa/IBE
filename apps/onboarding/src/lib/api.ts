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
};

export interface WizardState {
  sessionId: number;
  pmsId: number;
  pmsName: string;
  currentStep: number;
  totalSteps: number;
  steps: Array<{ id: string; kind: string; title: string; description: string; status: string }>;
  enrichedData: Record<string, unknown> | null;
  hgPropertyCode: string | null;
  status: string;
}
