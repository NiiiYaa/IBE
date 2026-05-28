'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  hotelName?: string;
  city?: string;
  country?: string;
  onComplete: () => void;
}

interface Candidate {
  url: string;
  title: string;
  detected: boolean;
  screenshotUrl: string | null;
}

type Phase = 'form' | 'searching' | 'results' | 'resolving';

const inputStyle = {
  width: '100%', padding: '0.7rem', border: '1px solid #d1d5db',
  borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' as const,
};

export function CandidateSearchStep({ step, hotelName: initialName = '', city: initialCity = '', country: initialCountry = '', onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('form');
  const [form, setForm] = useState({ hotelName: initialName, city: initialCity, country: initialCountry });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.hotelName.trim() || !form.city.trim()) { setError('Hotel name and city are required'); return; }
    setError(null);
    setPhase('searching');
    try {
      const result = await api.hotelSearch(form);
      setCandidates(result.candidates);
      setPhase('results');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setPhase('form');
    }
  }

  async function handleSelect(url: string) {
    setError(null);
    setPhase('resolving');
    try {
      await api.selectUrl(url);
      // Poll wizard state until step advances or pending_ibe_review
      pollingRef.current = setInterval(async () => {
        try {
          const state = await api.getState();
          const candidateIdx = state.steps.findIndex(s => s.id === 'candidate_search');
          const advanced = state.currentStep > candidateIdx || state.status === 'pending_ibe_review';
          if (advanced) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            onComplete();
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process URL');
      setPhase('results');
    }
  }

  const API_BASE = process.env['NEXT_PUBLIC_ONBOARDING_API_URL'] ?? 'http://localhost:3003';

  if (phase === 'form') {
    return (
      <div>
        <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>We&apos;ll find your hotel&apos;s booking engine and pull your room information automatically.</p>
        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>Hotel Name</label>
            <input type="text" required value={form.hotelName} onChange={e => setForm(p => ({ ...p, hotelName: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>City</label>
            <input type="text" required value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem' }}>Country</label>
            <input type="text" value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} style={inputStyle} />
          </div>
          {error && <p style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Search →
          </button>
        </form>
      </div>
    );
  }

  if (phase === 'searching') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: '#2563eb', fontSize: '1.1rem' }}>Searching for your hotel&apos;s booking engine…</p>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>This takes about 15 seconds</p>
      </div>
    );
  }

  if (phase === 'resolving') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: '#2563eb', fontSize: '1.1rem' }}>Finding your booking engine…</p>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>Following booking links to identify your system</p>
      </div>
    );
  }

  // results phase
  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>We found these results:</h2>
      {candidates.length === 0 && (
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>No results found. Try pasting your booking URL below.</p>
      )}
      {candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {candidates.map((c, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
              {c.screenshotUrl ? (
                <img
                  src={`${API_BASE}${c.screenshotUrl}`}
                  alt={c.title}
                  loading="lazy"
                  style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block', background: '#f3f4f6' }}
                />
              ) : (
                <div style={{ width: '100%', height: '80px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Preview unavailable</span>
                </div>
              )}
              <div style={{ padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{(() => { try { return new URL(c.url).hostname; } catch { return c.url; } })()}</span>
                  {c.detected && (
                    <span style={{ background: '#d1fae5', color: '#065f46', padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600 }}>
                      ✓ Booking engine detected
                    </span>
                  )}
                </div>
                <p style={{ color: '#6b7280', fontSize: '0.82rem', margin: '0 0 0.6rem' }}>{c.title}</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleSelect(c.url)}
                    style={{ padding: '0.45rem 0.9rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    Select this →
                  </button>
                  <a
                    href={c.url} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '0.45rem 0.9rem', border: '1px solid #d1d5db', borderRadius: '5px', color: '#374151', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  >
                    View site ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
        <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Or paste your booking URL directly:</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="url" placeholder="https://..." value={manualUrl}
            onChange={e => setManualUrl(e.target.value)}
            style={{ flex: 1, padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
          />
          <button
            onClick={() => manualUrl.trim() && handleSelect(manualUrl.trim())}
            disabled={!manualUrl.trim()}
            style={{ padding: '0.65rem 1rem', background: '#374151', color: '#fff', border: 'none', borderRadius: '6px', cursor: manualUrl.trim() ? 'pointer' : 'not-allowed', opacity: manualUrl.trim() ? 1 : 0.6, fontSize: '0.9rem', whiteSpace: 'nowrap' }}
          >
            Use this URL →
          </button>
        </div>
      </div>

      <button
        onClick={() => { setPhase('form'); setError(null); }}
        style={{ marginTop: '0.75rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
      >
        None of these look right? Search again
      </button>
      {error && <p style={{ color: '#dc2626', marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
