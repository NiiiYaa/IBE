'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AriSourceCombobox } from '@/components/AriSourceCombobox';
import type { AriSelection } from '@ibe/shared';

export default function RegisterPage() {
  const router = useRouter();
  const [hotelName, setHotelName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [ariSelection, setAriSelection] = useState<AriSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ariSelection) { setError('Please select your channel manager or PMS.'); return; }
    setLoading(true);
    setError(null);
    try {
      const body = ariSelection.kind === 'hg_has'
        ? { hotelName, pmsId: ariSelection.pmsId, contactEmail, ...(websiteUrl ? { websiteUrl } : {}) }
        : { hotelName, unknownPmsName: ariSelection.name, unknownPmsStatus: ariSelection.kind as 'to_be_added' | 'to_be_checked', contactEmail, ...(websiteUrl ? { websiteUrl } : {}) };
      const { redirect } = await api.register(body);
      router.push(redirect === 'wizard' ? '/wizard' : '/pending');
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
            <input type="text" required value={hotelName} onChange={e => setHotelName(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Channel Manager / PMS / CRS</label>
            <AriSourceCombobox value={ariSelection} onChange={setAriSelection} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Contact Email</label>
            <input type="email" required value={contactEmail} onChange={e => setContactEmail(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>Hotel Website <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span></label>
            <input type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
              placeholder="https://" style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" disabled={loading || !ariSelection}
            style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: (loading || !ariSelection) ? 'not-allowed' : 'pointer', opacity: (loading || !ariSelection) ? 0.7 : 1 }}>
            {loading ? 'Starting...' : 'Get Started →'}
          </button>
        </form>
      </div>
    </main>
  );
}
