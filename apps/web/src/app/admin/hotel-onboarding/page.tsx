'use client';

import { useEffect, useState } from 'react';
import { apiClient, type OnboardingInvitation } from '@/lib/api-client';

const PMS_OPTIONS = [
  { id: 12, name: 'SiteMinder' },
  { id: 25, name: 'TravelClick' },
];

const ONBOARDING_API_URL = process.env['NEXT_PUBLIC_ONBOARDING_API_URL'] ?? 'http://localhost:3003';

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

interface SearchCandidate {
  url: string;
  title: string;
  detected: boolean;
  screenshotUrl: string | null;
  score: number;
}

export default function HotelOnboardingPage() {
  const [invitations, setInvitations] = useState<OnboardingInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchForm, setSearchForm] = useState({ hotelName: '', city: '', country: '' });
  const [searching, setSearching] = useState(false);
  const [searchElapsed, setSearchElapsed] = useState(0);
  const [candidates, setCandidates] = useState<SearchCandidate[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');

  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [selectedDetected, setSelectedDetected] = useState(false);
  const [createForm, setCreateForm] = useState({ pmsId: 12, contactEmail: '' });
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const onboardingAppUrl = process.env['NEXT_PUBLIC_ONBOARDING_APP_URL'] ?? 'http://localhost:3002';

  async function load() {
    setLoading(true);
    try { setInvitations(await apiClient.listOnboardingInvitations()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearchElapsed(0);
    setSearchError(null);
    setCandidates(null);
    const timer = setInterval(() => setSearchElapsed(s => s + 1), 1000);
    try {
      const result = await apiClient.searchOnboardingHotel({
        hotelName: searchForm.hotelName,
        city: searchForm.city,
        ...(searchForm.country ? { country: searchForm.country } : {}),
      });
      setCandidates(result.candidates);
      // Fetch screenshots progressively in the background
      result.candidates.forEach((c, i) => {
        if (c.screenshotUrl) return; // already has one (Brave path)
        fetch(`${ONBOARDING_API_URL}/screenshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: c.url }),
        })
          .then(r => r.ok ? r.json() : null)
          .then((data: { screenshotUrl: string | null } | null) => {
            if (!data?.screenshotUrl) return;
            setCandidates(prev => prev
              ? prev.map((p, j) => j === i ? { ...p, screenshotUrl: data.screenshotUrl } : p)
              : prev
            );
          })
          .catch(() => {});
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      clearInterval(timer);
      setSearching(false);
    }
  }

  function selectCandidate(c: SearchCandidate) {
    setSelectedUrl(c.url);
    setSelectedDetected(c.detected);
    setCreateError(null);
    setNewLink(null);
  }

  function useManualUrl() {
    if (!manualUrl.trim()) return;
    setSelectedUrl(manualUrl.trim());
    setSelectedDetected(false);
    setCreateError(null);
    setNewLink(null);
  }

  function resetSearch() {
    setSelectedUrl(null);
    setSelectedDetected(false);
    setNewLink(null);
    setCreateError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUrl) return;
    setCreating(true);
    setCreateError(null);
    setNewLink(null);
    try {
      const inv = await apiClient.createOnboardingInvitation({
        pmsId: createForm.pmsId,
        ...(searchForm.hotelName ? { hotelName: searchForm.hotelName } : {}),
        ...(createForm.contactEmail ? { contactEmail: createForm.contactEmail } : {}),
        ibeUrl: selectedUrl,
      });
      setNewLink(`${onboardingAppUrl}/start/${inv.token}`);
      setSearchForm({ hotelName: '', city: '', country: '' });
      setCandidates(null);
      setSelectedUrl(null);
      setManualUrl('');
      setCreateForm({ pmsId: 12, contactEmail: '' });
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create invitation');
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

  const inputStyle = { padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' as const };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Invitations</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Generate invitation links and monitor self-onboarding sessions.</p>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>New Invitation</h2>

        {!selectedUrl ? (
          <>
            {/* Step 1: search */}
            <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel Name *</label>
                <input type="text" required value={searchForm.hotelName}
                  onChange={e => setSearchForm(p => ({ ...p, hotelName: e.target.value }))}
                  placeholder="e.g. Grand Hotel Roma"
                  style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>City <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional – recommended)</span></label>
                <input type="text" value={searchForm.city}
                  onChange={e => setSearchForm(p => ({ ...p, city: e.target.value }))}
                  placeholder="e.g. Rome"
                  style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Country <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional – recommended)</span></label>
                <input type="text" value={searchForm.country}
                  onChange={e => setSearchForm(p => ({ ...p, country: e.target.value }))}
                  placeholder="e.g. Italy"
                  style={{ ...inputStyle, width: '100%' }} />
              </div>
              <button type="submit" disabled={searching || !searchForm.hotelName.trim()}
                style={{ padding: '0.6rem 1.2rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (searching || !searchForm.hotelName.trim()) ? 0.7 : 1 }}>
                {searching ? `Searching… ${searchElapsed}s` : 'Search'}
              </button>
            </form>

            {searching && (
              <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                Be patient — search can take up to 20 seconds (AI lookup + screenshot).
              </p>
            )}
            {searchError && <p style={{ color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' }}>{searchError}</p>}

            {candidates !== null && (
              <div style={{ marginBottom: '1rem' }}>
                {candidates.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No results found. Paste the URL manually below.</p>
                ) : (
                  <>
                    <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem', fontWeight: 600 }}>{candidates.length} result{candidates.length !== 1 ? 's' : ''} — click to select:</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                      {candidates.map((c, i) => (
                        <div key={i} onClick={() => selectCandidate(c)}
                          style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', background: '#fff', position: 'relative' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}>
                          {c.screenshotUrl ? (
                            <img src={`${ONBOARDING_API_URL}${c.screenshotUrl}`} alt={c.title}
                              style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          ) : (
                            <div style={{ width: '100%', height: '120px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Loading preview…</span>
                            </div>
                          )}
                          <a href={c.url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Open in new tab"
                            style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(255,255,255,0.9)', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 5px', fontSize: '0.7rem', color: '#374151', textDecoration: 'none', lineHeight: 1 }}>
                            ↗
                          </a>
                          <div style={{ padding: '0.6rem' }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</p>
                            <p style={{ fontSize: '0.7rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.3rem' }}>{c.url}</p>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {c.detected && (
                                <span style={{ background: '#d1fae5', color: '#065f46', fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px' }}>IBE detected</span>
                              )}
                              <span style={{
                                background: c.score >= 70 ? '#dbeafe' : c.score >= 40 ? '#fef9c3' : '#f3f4f6',
                                color: c.score >= 70 ? '#1d4ed8' : c.score >= 40 ? '#92400e' : '#6b7280',
                                fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px',
                              }}>{c.score}% match</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
                  <input type="url" value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                    placeholder="Or paste a URL manually…"
                    style={{ flex: 1, ...inputStyle, fontSize: '0.875rem' }} />
                  <button type="button" onClick={useManualUrl} disabled={!manualUrl.trim()}
                    style={{ padding: '0.6rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'transparent', cursor: manualUrl.trim() ? 'pointer' : 'not-allowed', fontSize: '0.875rem', opacity: manualUrl.trim() ? 1 : 0.5 }}>
                    Use this URL
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Step 2: complete invitation */
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1d4ed8' }}>Selected URL</span>
                  {selectedDetected && <span style={{ background: '#d1fae5', color: '#065f46', fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px' }}>IBE detected</span>}
                </div>
                <p style={{ fontSize: '0.8rem', color: '#1e40af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{selectedUrl}</p>
              </div>
              <button type="button" onClick={resetSearch}
                style={{ flexShrink: 0, fontSize: '0.8rem', color: '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                ✕ Change
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Channel Manager</label>
                <select value={createForm.pmsId} onChange={e => setCreateForm(p => ({ ...p, pmsId: parseInt(e.target.value) }))}
                  style={{ width: '100%', ...inputStyle }}>
                  {PMS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Contact Email</label>
                <input type="email" value={createForm.contactEmail}
                  onChange={e => setCreateForm(p => ({ ...p, contactEmail: e.target.value }))}
                  placeholder="hotel@example.com (optional)"
                  style={{ width: '100%', ...inputStyle }} />
              </div>
            </div>

            {createError && <p style={{ color: '#dc2626' }}>{createError}</p>}
            <button type="submit" disabled={creating}
              style={{ padding: '0.7rem 1.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Creating…' : 'Generate Invitation Link'}
            </button>
          </form>
        )}

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
                {['Hotel', 'CM', 'Harvest', 'Session', 'Expires', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                ))}
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
