import type { VendorFlow, StepDefinition, DataFlow } from './types.js';

export function defaultStepsFor(dataFlow: DataFlow): StepDefinition[] {
  const base: StepDefinition[] = [
    { id: 'candidate_search', kind: 'candidate_search', title: 'Find Your Hotel Online', description: 'Search for your hotel\'s booking engine, or paste your booking URL directly.' },
    { id: 'harvest_data', kind: 'automated', title: 'Collecting Your Property Information', description: 'Pulling room details, policies, and images from your booking engine.' },
    { id: 'review_data', kind: 'data_review', title: 'Review Your Property Information', description: 'Check the details we collected and edit anything that needs updating.' },
    { id: 'geocode_address', kind: 'automated', title: 'Verifying Your Location', description: 'Looking up your property address and coordinates so your hotel appears correctly on maps.' },
    { id: 'ari_source_selection', kind: 'ari_source_selection', title: 'Select Your Channel Manager', description: 'Tell us which channel manager pushes your availability and rates to HyperGuest.' },
    { id: 'collect_credentials', kind: 'credentials', title: 'Connect Your Channel Manager', description: 'Enter your channel manager credentials to enable live availability and rates.' },
    { id: 'cm_settings', kind: 'cm_settings', title: 'Rate & Tax Configuration', description: 'Tell us how your channel manager sends rates so prices display correctly.' },
    { id: 'create_hg_property', kind: 'automated', title: 'Creating Your HyperGuest Profile', description: 'Setting up your property in the HyperGuest system.' },
    { id: 'trigger_ari_sync', kind: 'automated', title: 'Syncing Availability & Rates', description: 'Triggering your first availability and rate sync.' },
  ];

  if (dataFlow === 'blank') {
    // blank: insert create_rooms + create_rateplans after create_hg_property
    const createIdx = base.findIndex(s => s.id === 'create_hg_property');
    base.splice(createIdx + 1, 0,
      { id: 'create_rooms', kind: 'automated', title: 'Creating Room Types', description: 'Creating your room types in HyperGuest with your channel manager codes.' },
      { id: 'create_rateplans', kind: 'automated', title: 'Creating Rate Plans', description: 'Creating rate plans and linking them to room types.' },
      { id: 'create_policies', kind: 'automated', title: 'Setting Up Policies', description: 'Creating cancellation policies.' },
      { id: 'create_taxes', kind: 'automated', title: 'Setting Up Taxes', description: 'Configuring tax and fee settings.' },
    );
  }

  return base;
}

export function validateVendorFlow(flow: VendorFlow): void {
  if (!flow.pmsId) throw new Error(`VendorFlow missing pmsId`);
  if (!flow.pmsName) throw new Error(`VendorFlow ${flow.pmsId} missing pmsName`);
  if (!flow.steps.length) throw new Error(`VendorFlow ${flow.pmsName} has no steps`);

  const ids = flow.steps.map(s => s.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`VendorFlow ${flow.pmsName} has duplicate step ids: ${dupes.join(', ')}`);

  if (flow.useDefaultCodes && flow.ratePlanCodesProvidedByStaff) {
    throw new Error(`VendorFlow ${flow.pmsName}: useDefaultCodes and ratePlanCodesProvidedByStaff are mutually exclusive`);
  }
}

export function createVendorFlow(config: Omit<VendorFlow, 'steps'> & { steps?: StepDefinition[] }): VendorFlow {
  const flow: VendorFlow = {
    ...config,
    steps: config.steps ?? defaultStepsFor(config.dataFlow),
  };
  validateVendorFlow(flow);
  return flow;
}
