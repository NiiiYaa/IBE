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
  // Detailed occupancy breakdown (adults/children/infants with age ranges)
  maxChildren: number | null;
  maxInfants: number | null;
  baseOccupancy: number | null;
  baseAdults: number | null;
  baseChildren: number | null;
  baseInfants: number | null;
  /** Age thresholds derived from occupancy probe (probeOccupancy service) */
  adultsAgeFrom: number | null;   // first age = adult (e.g. 13)
  childrenAgeFrom: number | null; // first age = child (e.g. 4)
  childrenAgeTo: number | null;   // last age = child (e.g. 12)
  infantsAgeTo: number | null;    // last age = infant (e.g. 3)
  /** Per-age price points from probe — shows price change at each child age */
  agePricePoints?: Array<{ age: number; found: boolean; lowestPrice: number | null; priceChangedFromBase: boolean }> | null;
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

export interface PreAction {
  title: string;       // Short title shown as a heading
  instruction: string; // Full instructions for the hotel
  contactEmail?: string; // Support address to contact, if applicable
}

export interface VendorFlow {
  pmsId: number;
  pmsName: string;
  // Steps the HOTEL must complete before or during the wizard that require
  // action on the CM's side (e.g. contacting support, requesting activation).
  // Used in the invitation email and wizard pre-flight screen.
  preActions?: PreAction[];
  // Whether this flow was verified against the HyperGuest KB (Zoho Desk integration articles).
  // false = built generically — credential format and exact steps may need verification.
  kbVerified?: boolean;
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
