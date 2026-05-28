'use client';

import type { WizardState } from '@/lib/api';

interface Props {
  state: WizardState;
  children: React.ReactNode;
}

export function WizardLayout({ state, children }: Props) {
  const progress = state.totalSteps > 0 ? (state.currentStep / state.totalSteps) * 100 : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a2e' }}>HyperGuest</span>
        <span style={{ color: '#666', fontSize: '0.9rem' }}>Hotel Onboarding — {state.pmsName}</span>
      </header>

      <div style={{ background: '#e0e0e0', height: '4px' }}>
        <div style={{ background: '#2563eb', height: '100%', width: `${progress}%`, transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ textAlign: 'center', padding: '0.75rem', color: '#666', fontSize: '0.85rem' }}>
        Step {state.currentStep + 1} of {state.totalSteps}
      </div>

      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '2rem 1rem' }}>
        {children}
      </main>
    </div>
  );
}
