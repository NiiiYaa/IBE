import { z } from 'zod';

export type StepKind =
  | 'automated'
  | 'candidate_search'
  | 'data_review'
  | 'ari_source_selection'
  | 'credentials'
  | 'cm_settings'
  | 'user_action'
  | 'pending_ibe'
  | 'pending_ari_source';

export interface StepDefinition {
  id: string;
  kind: StepKind;
  title: string;
  description: string;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export type DataFlow = 'hg_pulls' | 'blank' | 'reverse_pull';

export type PricingModel = 'per_room' | 'per_occupancy' | 'per_person';

export type TaxRelation = 'included' | 'add' | 'display' | 'optional' | 'ignore';

export interface CancellationPolicyFrame {
  daysBeforeCheckin: number;
  penaltyValue: number;
  chargeType: 'percent' | 'currency';
}

export type HarvestedCancellationPolicy =
  | { type: 'non_refundable' }
  | {
      type: 'custom';
      deadlineDays: number;
      noShowPenalty: { value: number; chargeType: 'percent' | 'currency' };
      frames: CancellationPolicyFrame[];
    };

export interface HarvestedOccupancy {
  adults: number;
  children: number;
}

export interface DiscoveredRatePlanType {
  boardCode: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  boardCodeRawName: string;
  hasRefundable: boolean;
  hasNonRefundable: boolean;
  refundableCancellationPolicy: HarvestedCancellationPolicy | null;
  refundableExampleName: string | null;
  nonRefundableExampleName: string | null;
}

export interface HarvestedRoom {
  name: string;
  description: string;
  images: string[];
  bedConfiguration: string | null;
  amenities: string[];
  supportedOccupancies: HarvestedOccupancy[];
  maxAdults: number | null;
  maxOccupancy: number | null;
}

export interface HarvestedFee {
  name: string;
  amount: string | null;
  notes: string | null;
  source: 'ibe' | 'lookup';
}

export type PolicyType =
  | 'check_in_time'
  | 'check_out_time'
  | 'pets'
  | 'smoking'
  | 'min_checkin_age'
  | 'parking'
  | 'extra_bed'
  | 'other';

export interface HarvestedPolicy {
  type: PolicyType;
  value: string;
  rawText: string | null;
}

export interface AgeCategory {
  name: string;
  minAge: number;
  maxAge: number;
}

export interface DiscoveredAgePolicy {
  categories: AgeCategory[];
  hasTieredChildPricing: boolean;
  source: 'dropdown' | 'text' | 'price_sweep' | 'unknown';
  rawText: string | null;
}

export interface HarvestedHotelData {
  name: string;
  starRating: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string;
  images: string[];
  amenities: string[];
  rooms: HarvestedRoom[];
  discoveredRatePlanTypes: DiscoveredRatePlanType[];
  policies: HarvestedPolicy[];
  agePolicy: DiscoveredAgePolicy | null;
  taxesAndFees: HarvestedFee[];
}

export interface CmSettings {
  currency: string;
  pricingModel: PricingModel;
  ratePlans: Array<{
    boardCode: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
    priceType: 'gross' | 'net';
    commissionPercent: number;
    charge: 'agent' | 'customer';
    cancellationPolicy: HarvestedCancellationPolicy;
    pmsRateplanCode?: string;
  }>;
  taxRelations: Record<string, TaxRelation>;
}

export interface OnboardingContext {
  sessionId: number;
  pmsId: number;
  organizationId: number;
  credentials: Record<string, string>;
  cmSettings?: CmSettings;
  enrichedData: Record<string, unknown>;
  hgPropertyCode?: string;
  completedSteps: StepResult[];
  dataFlowOverride?: DataFlow;
}

export interface VendorFlow {
  pmsId: number;
  pmsName: string;
  dataFlow: DataFlow;
  canOverrideDataFlow?: boolean;
  requiresStaffChannelSetup: boolean;
  staffChannelSetupNote?: string;
  ratePlanCodesProvidedByStaff?: boolean;
  useDefaultCodes?: boolean;
  mandatoryTaxRelations?: Record<string, TaxRelation>;
  supportedPricingModels?: PricingModel[];
  childrenSupported?: boolean;
  roomCodeFormat?: { pattern: string; errorMessage: string };
  regionAware?: boolean;
  credentialTransform?: (creds: Record<string, string>) => Record<string, string>;
  ratePlanCodeTransform?: (code: string, boardCode: string) => string;
  steps: StepDefinition[];
  credentialsSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  validateConnection: (ctx: OnboardingContext) => Promise<{ valid: boolean; message?: string }>;
  getHGPropertyPayload: (ctx: OnboardingContext) => Record<string, unknown>;
}
