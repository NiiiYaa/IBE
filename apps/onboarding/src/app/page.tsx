'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const PMS_OPTIONS = [{ id: 3, name: 'SiteMinder' }];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ hotelName: '', pmsId: 3, contactEmail: '', websiteUrl: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.register({ ...form, ...(form.websiteUrl ? { websiteUrl: form.websiteUrl } : {}) });
      router.push('/wizard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Connect Your Property</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>Join HyperGuest in a few simple steps.</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Hotel Name</label>
            <input type="text" required value={form.hotelName} onChange={(e) => setForm((p) => ({ ...p, hotelName: e.target.value }))}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Channel Manager</label>
            <select value={form.pmsId} onChange={(e) => setForm((p) => ({ ...p, pmsId: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem' }}>
              {PMS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Contact Email</label>
            <input type="email" required value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Hotel Website <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span></label>
            <input type="url" value={form.websiteUrl} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))}
              placeholder="https://" style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Starting...' : 'Get Started →'}
          </button>
        </form>
      </div>
    </main>
  );
}
