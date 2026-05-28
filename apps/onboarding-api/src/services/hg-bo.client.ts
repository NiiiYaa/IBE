import { fetch } from 'undici';

export class HGBoClient {
  private base: string;
  private apiKey: string;

  constructor(base: string, apiKey: string) {
    this.base = base.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}`;
    const init: Parameters<typeof fetch>[1] = { method, headers: this.headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HG BO API ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async createProperty(payload: Record<string, unknown>) {
    return this.request<{ property: { propertyCode: string } }>(
      'POST',
      '/api/v1/integration/properties/',
      payload
    );
  }

  async getProperty(propertyCode: string) {
    return this.request<Record<string, unknown>>('GET', `/api/v1/integration/properties/${propertyCode}`);
  }

  async triggerAriSync(propertyCode: string) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/trigger-update`
    );
  }

  async listRooms(propertyCode: string) {
    return this.request<unknown[]>('GET', `/api/v1/integration/properties/${propertyCode}/rooms`);
  }

  async createTaxFee(propertyCode: string, taxFee: {
    title: string;
    chargeType: 'percent' | 'currency';
    chargeValue: number;
    category: 'tax' | 'fee';
    scope: 'per_stay' | 'per_room' | 'per_person' | 'per_adult' | 'per_child';
    frequency: 'per_stay' | 'per_night' | 'per_week';
    defaultRatePlanRelation: 'included' | 'add' | 'display' | 'optional' | 'ignore';
  }) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/taxes-fees`,
      taxFee
    );
  }

  async createPolicy(propertyCode: string, policy: Record<string, unknown>) {
    return this.request<{ policyCode: string }>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/policies`,
      policy
    );
  }

  async linkPolicyToRatePlan(propertyCode: string, rateplanCode: string, policyCode: string) {
    return this.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/integration/properties/${propertyCode}/rateplans/${rateplanCode}/policies/${policyCode}`,
      {}
    );
  }

  async setRatePlanTaxes(propertyCode: string, rateplanCode: string, relations: Record<string, 'included' | 'add' | 'display' | 'optional' | 'ignore'>) {
    return this.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/integration/properties/${propertyCode}/rateplans/${rateplanCode}/taxes-fees`,
      relations
    );
  }

  async createRoom(propertyCode: string, room: { type: string; name: string; code: string }) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/rooms`,
      room
    );
  }

  async createRatePlan(propertyCode: string, ratePlan: {
    name: string;
    pmsRateplanCode: string;
    priceType: 'gross' | 'net';
    boardCode?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  }) {
    return this.request<Record<string, unknown>>(
      'POST',
      `/api/v1/integration/properties/${propertyCode}/rateplans`,
      ratePlan
    );
  }

  async linkRoomsToRatePlan(propertyCode: string, rateplanCode: string, roomCodes: string[]) {
    return this.request<Record<string, unknown>>(
      'PUT',
      `/api/v1/integration/properties/${propertyCode}/rateplans/${rateplanCode}/rooms`,
      { roomCodes }
    );
  }
}

let _client: HGBoClient | undefined;
export function getHGBoClient(): HGBoClient {
  if (!_client) {
    const base = process.env['HG_BO_API_BASE'] ?? '';
    const key = process.env['HG_BO_API_KEY'] ?? '';
    _client = new HGBoClient(base, key);
  }
  return _client;
}
