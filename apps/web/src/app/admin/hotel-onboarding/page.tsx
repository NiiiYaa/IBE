'use client';

import { useEffect, useState } from 'react';
import { apiClient, type OnboardingInvitation } from '@/lib/api-client';

const PMS_OPTIONS = [
  { id: 12, name: 'SiteMinder' },
  { id: 25, name: 'TravelClick' },
];

const SESSION_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  in_progress: { bg: '#dbeafe', color: '#1e40af' },
  pending_ibe_review: { bg: '#fee2e2', color: '#991b1b' },
  pending_ari_source: { bg: '#fee2e2', color: '#991b1b' },
  pending_review: { bg: '#fef3c7', color: '#92400e' },
  approved: { bg: '#d1fae5', color: '#065f46' },
  abandoned: { bg: '#f3f4f6', color: '#6b7280' },
};

const HARVEST_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#f3f4f6', color: '#6b7280' },
  harvesting: { bg: '#dbeafe', color: '#1e40af' },
  complete: { bg: '#d1fae5', color: '#065f46' },
  failed: { bg: '#fee2e2', color: '#991b1b' },
};

function Badge({ label, status, map }: { label: string; status: string; map: Record<string, { bg: string; color: string }> }) {
  const style = map[status] ?? { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: style.bg, color: style.color, padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
      {label}
    </span>
  );
}

export default function HotelOnboardingPage() {
  const [invitations, setInvitations] = useState<OnboardingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ pmsId: 12, hotelName: '', contactEmail: '', websiteUrl: '' });
  const [newLink, setNewLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onboardingAppUrl = process.env['NEXT_PUBLIC_ONBOARDING_APP_URL'] ?? 'http://localhost:3002';

  async function load() {
    setLoading(true);
    try {
      setInvitations(await apiClient.listOnboardingInvitations());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNewLink(null);
    try {
      const inv = await apiClient.createOnboardingInvitation({
        pmsId: form.pmsId,
        ...(form.hotelName ? { hotelName: form.hotelName } : {}),
        ...(form.contactEmail ? { contactEmail: form.contactEmail } : {}),
        ...(form.websiteUrl ? { websiteUrl: form.websiteUrl } : {}),
      });
      setNewLink(`${onboardingAppUrl}/start/${inv.token}`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number) {
    if (!confirm('Revoke this invitation?')) return;
    await apiClient.revokeOnboardingInvitation(id);
    await load();
  }

  async function handleApprove(sessionId: number) {
    await apiClient.approveOnboardingSession(sessionId);
    await load();
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Hotel Onboarding</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Generate invitation links and monitor self-onboarding sessions.</p>

      {/* Create form */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>New Invitation</h2>
        <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Channel Manager</label>
            <select
              value={form.pmsId}
              onChange={(e) => setForm((p) => ({ ...p, pmsId: parseInt(e.target.value) }))}
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              {PMS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel Name</label>
            <input type="text" value={form.hotelName} onChange={(e) => setForm((p) => ({ ...p, hotelName: e.target.value }))} placeholder="Optional"
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Contact Email</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} placeholder="Optional"
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel Website</label>
            <input type="url" value={form.websiteUrl} onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://..."
              style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            {error && <p style={{ color: '#dc2626', marginBottom: '0.5rem' }}>{error}</p>}
            <button type="submit" disabled={creating}
              style={{ padding: '0.7rem 1.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Creating...' : 'Generate Invitation Link'}
            </button>
          </div>
        </form>

        {newLink && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
            <p style={{ fontWeight: 600, color: '#15803d', marginBottom: '0.25rem' }}>Invitation link ready:</p>
            <code style={{ wordBreak: 'break-all', fontSize: '0.875rem', color: '#166534' }}>{newLink}</code>
            <button onClick={() => navigator.clipboard.writeText(newLink)}
              style={{ marginLeft: '1rem', padding: '0.25rem 0.75rem', border: '1px solid #16a34a', borderRadius: '4px', background: 'transparent', color: '#16a34a', cursor: 'pointer', fontSize: '0.8rem' }}>
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Invitations table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
          Invitations &amp; Sessions
        </div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading...</div>
        ) : invitations.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No invitations yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Hotel</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>CM</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Harvest</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Session</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Expires</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>{inv.hotelName || '—'}</div>
                    {inv.contactEmail && <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{inv.contactEmail}</div>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{inv.pmsName ?? '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Badge label={inv.harvestStatus} status={inv.harvestStatus} map={HARVEST_STATUS_COLORS} />
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {inv.session
                      ? <Badge label={inv.session.status} status={inv.session.status} map={SESSION_STATUS_COLORS} />
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {!inv.usedAt && !inv.revokedAt && (
                      <>
                        <button onClick={() => navigator.clipboard.writeText(`${onboardingAppUrl}/start/${inv.token}`)}
                          style={{ padding: '0.25rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: 'transparent' }}>
                          Copy Link
                        </button>
                        <button onClick={() => handleRevoke(inv.id)}
                          style={{ padding: '0.25rem 0.6rem', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: 'transparent', color: '#dc2626' }}>
                          Revoke
                        </button>
                      </>
                    )}
                    {inv.session?.status === 'pending_review' && (
                      <button onClick={() => handleApprove(inv.session!.id)}
                        style={{ padding: '0.25rem 0.6rem', border: '1px solid #16a34a', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', background: 'transparent', color: '#16a34a' }}>
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
