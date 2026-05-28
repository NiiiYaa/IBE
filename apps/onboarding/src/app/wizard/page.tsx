'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type WizardState } from '@/lib/api';
import { WizardLayout } from '@/components/WizardLayout';
import { AutomatedStep } from '@/components/steps/AutomatedStep';
import { CredentialsStep } from '@/components/steps/CredentialsStep';
import { DataReviewStep } from '@/components/steps/DataReviewStep';
import { UserActionStep } from '@/components/steps/UserActionStep';

export default function WizardPage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadState() {
    try {
      const s = await api.getState();
      setState(s);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('401') || msg.includes('No session')) {
        router.push('/');
      } else {
        setError(msg || 'Failed to load wizard state');
      }
    }
  }

  useEffect(() => { loadState(); }, []);

  if (error) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666' }}>{error}</p>
          <button onClick={loadState}>Retry</button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (state.status === 'pending_review' || state.status === 'approved') {
    router.push('/pending');
    return null;
  }

  const currentStepDef = state.steps[state.currentStep];

  function renderStep() {
    if (!currentStepDef || !state) return null;
    switch (currentStepDef.kind) {
      case 'automated':
        return <AutomatedStep step={currentStepDef} onComplete={loadState} />;
      case 'credentials':
        return <CredentialsStep step={currentStepDef} pmsId={state.pmsId ?? 0} onComplete={loadState} />;
      case 'data_review':
        return <DataReviewStep step={currentStepDef} state={state} onComplete={loadState} />;
      case 'user_action':
        return <UserActionStep step={currentStepDef} />;
      default:
        return <p>Unknown step type: {currentStepDef.kind}</p>;
    }
  }

  return (
    <WizardLayout state={state}>
      {renderStep()}
    </WizardLayout>
  );
}
