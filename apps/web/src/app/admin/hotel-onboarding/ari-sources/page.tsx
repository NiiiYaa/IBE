'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { apiClient } from '@/lib/api-client';

const ARI_SOURCES = [
  { name: 'SiteMinder', pmsId: 12, dataFlow: 'blank', useDefaultCodes: false, regionAware: true, steps: 13 },
  { name: 'TravelClick', pmsId: 25, dataFlow: 'blank', useDefaultCodes: true, regionAware: true, steps: 13 },
] as const;

export default function AriSourcesPage() {
  const [filter, setFilter] = useState('');
  const [stats, setStats] = useState<Record<number, { total: number; approved: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getOnboardingStats()
      .then(s => setStats(s.ariStats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = ARI_SOURCES.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  const cell: CSSProperties = { padding: '0.75rem 1rem' };
  const hcell: CSSProperties = { ...cell, textAlign: 'left', fontWeight: 600 };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>ARI Sources</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>Registered channel manager integrations available for self-onboarding.</p>

      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name…"
        style={{ width: '100%', maxWidth: '320px', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '1rem', display: 'block' }}
      />

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Name', 'pmsId', 'Data Flow', 'Default Codes', 'Region Aware', 'Steps', 'Invitations', 'Approved'].map(h => (
                <th key={h} style={hcell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.pmsId} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td style={{ ...cell, fontWeight: 600 }}>{s.name}</td>
                <td style={{ ...cell, color: '#6b7280' }}>{s.pmsId}</td>
                <td style={cell}>
                  <span style={{
                    background: '#fef3c7', color: '#92400e',
                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                  }}>
                    {s.dataFlow}
                  </span>
                </td>
                <td style={cell}>{s.useDefaultCodes ? 'Yes' : 'No'}</td>
                <td style={cell}>{s.regionAware ? 'Yes' : 'No'}</td>
                <td style={cell}>{s.steps}</td>
                <td style={cell}>{loading ? '—' : (stats[s.pmsId]?.total ?? 0)}</td>
                <td style={cell}>{loading ? '—' : (stats[s.pmsId]?.approved ?? 0)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...cell, textAlign: 'center', color: '#6b7280' }}>No results</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
