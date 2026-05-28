'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  pmsId: number;
  onComplete: () => void;
}

const CREDENTIAL_FIELDS: Record<number, Array<{ key: string; label: string; placeholder: string; hint?: string }>> = {
  3: [
    {
      key: 'propertyId',
      label: 'SiteMinder Property ID',
      placeholder: 'e.g. SM-12345',
      hint: 'Find this in your SiteMinder dashboard under Settings → Property.',
    },
  ],
};

export function CredentialsStep({ step, pmsId, onComplete }: Props) {
  const fields = CREDENTIAL_FIELDS[pmsId] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.submitCredentials(values);
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {fields.map((field) => (
          <div key={field.key}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>{field.label}</label>
            <input
              type="text"
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              required
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }}
            />
            {field.hint && <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.4rem' }}>{field.hint}</p>}
          </div>
        ))}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
