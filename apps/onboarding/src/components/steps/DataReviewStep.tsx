'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  enrichedData: Record<string, unknown>;
  onComplete: () => void;
}

const EDITABLE_FIELDS = [
  { key: 'hotelName', label: 'Hotel Name', type: 'text' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'countryCode', label: 'Country Code (2-letter)', type: 'text' },
  { key: 'websiteUrl', label: 'Website URL', type: 'url' },
  { key: 'contactEmail', label: 'Contact Email', type: 'email' },
  { key: 'starRating', label: 'Star Rating (1-5)', type: 'number' },
  { key: 'roomCount', label: 'Number of Rooms', type: 'number' },
];

export function DataReviewStep({ step, enrichedData, onComplete }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.key, String(enrichedData[f.key] ?? '')]))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values['hotelName']?.trim()) { setError('Hotel name is required'); return; }
    if (!values['city']?.trim()) { setError('City is required'); return; }
    if (!values['countryCode']?.trim() || values['countryCode'].length !== 2) { setError('Country code must be 2 letters (e.g. GB, US)'); return; }

    setError(null);
    setLoading(true);
    try {
      await api.confirmReview({ ...enrichedData, ...values });
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {EDITABLE_FIELDS.map((field) => (
          <div key={field.key}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}>{field.label}</label>
            <input
              type={field.type}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              style={{ width: '100%', padding: '0.7rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
            />
          </div>
        ))}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Saving...' : 'Confirm & Continue'}
        </button>
      </form>
    </div>
  );
}
