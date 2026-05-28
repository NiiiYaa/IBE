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

export interface HarvestedCancellationPolicy {
  type: 'non_refundable';
}
// (full union type kept minimal for now — expanded in later tasks)

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
