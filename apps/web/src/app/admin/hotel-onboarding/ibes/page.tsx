'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { apiClient } from '@/lib/api-client';

const IBES = [
  { name: 'Sentec',            detection: 'Domain',        scraping: 'Full',        harvester: true  },
  { name: 'SimpleBooking.it',  detection: 'Domain',        scraping: 'Full',        harvester: true  },
  { name: 'direct-book.com',   detection: 'Domain',        scraping: 'Full',        harvester: true  },
  { name: 'BookingExpert',     detection: 'Domain+Params', scraping: 'Search only', harvester: false },
  { name: 'Falkensteiner',     detection: 'Domain',        scraping: 'Search only', harvester: false },
  { name: 'BookSecure',        detection: 'Domain',        scraping: 'Search only', harvester: false },
  { name: 'Sabre SynXis',      detection: 'Params',        scraping: 'Search only', harvester: true  },
  { name: 'WebHotelier',       detection: 'Domain',        scraping: 'Search only', harvester: false },
  { name: 'Hotels of Mykonos', detection: 'Domain',        scraping: 'Search only', harvester: false },
  { name: 'Zenith Hotels (MY)',detection: 'Domain',        scraping: 'Search only', harvester: false },
  { name: 'Lighthouse',        detection: 'Domain',        scraping: 'Search only', harvester: false },
  { name: 'TravelClick',       detection: 'Params',        scraping: 'Search only', harvester: false },
  { name: 'Hotetec',           detection: 'Params',        scraping: 'Search only', harvester: false },
];

export default function IbesPage() {
  const [filter, setFilter]     = useState('');
  const [stats, setStats]       = useState<Record<string, { total: number; approved: number }>>({});
  const [sampleUrls, setSampleUrls] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);

  // name overrides: original name → display label (persisted in localStorage)
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('ibe-name-overrides-v1') ?? '{}'); }
    catch { return {}; }
  });
  const [editingIbe, setEditingIbe] = useState<string | null>(null);
  const [editValue, setEditValue]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiClient.getOnboardingStats()
      .then(s => { setStats(s.ibeStats); setSampleUrls(s.ibeSampleUrls); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editingIbe) inputRef.current?.focus();
  }, [editingIbe]);

  function startEdit(originalName: string) {
    setEditingIbe(originalName);
    setEditValue(nameOverrides[originalName] ?? originalName);
  }

  function commitEdit(originalName: string) {
    const trimmed = editValue.trim();
    const updated = { ...nameOverrides };
    if (trimmed && trimmed !== originalName) {
      updated[originalName] = trimmed;
    } else {
      delete updated[originalName];
    }
    setNameOverrides(updated);
    localStorage.setItem('ibe-name-overrides-v1', JSON.stringify(updated));
    setEditingIbe(null);
  }

  function cancelEdit() {
    setEditingIbe(null);
  }

  const filtered = IBES.filter(ibe => {
    const display = nameOverrides[ibe.name] ?? ibe.name;
    return display.toLowerCase().includes(filter.toLowerCase()) ||
           ibe.name.toLowerCase().includes(filter.toLowerCase());
  });

  const cell: CSSProperties  = { padding: '0.75rem 1rem' };
  const hcell: CSSProperties = { ...cell, textAlign: 'left', fontWeight: 600 };

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>IBEs</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>Known Internet Booking Engine patterns supported for automated hotel data harvesting.</p>

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
              {['Name', 'Detection', 'Scraping', 'Harvester', 'Invitations', 'Approved', 'View'].map(h => (
                <th key={h} style={hcell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(ibe => {
              const displayName = nameOverrides[ibe.name] ?? ibe.name;
              const isEditing   = editingIbe === ibe.name;
              const isRenamed   = !!nameOverrides[ibe.name];
              return (
                <tr key={ibe.name} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ ...cell, fontWeight: 600, minWidth: '160px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          ref={inputRef}
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter')  commitEdit(ibe.name);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          onBlur={() => commitEdit(ibe.name)}
                          style={{ flex: 1, padding: '3px 6px', border: '1px solid #2563eb', borderRadius: '4px', fontSize: '0.875rem', fontWeight: 600, minWidth: 0 }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{displayName}</span>
                        {isRenamed && (
                          <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 400 }} title={`Original: ${ibe.name}`}>
                            ({ibe.name})
                          </span>
                        )}
                        <button
                          onClick={() => startEdit(ibe.name)}
                          title="Edit name"
                          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '0 2px', lineHeight: 1, fontSize: '0.8rem' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#6b7280')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}
                        >
                          ✎
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{ ...cell, color: '#6b7280', fontSize: '0.8rem' }}>{ibe.detection}</td>
                  <td style={cell}>
                    {ibe.scraping === 'Full' ? (
                      <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>✓ Full</span>
                    ) : (
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>⚠ Search only</span>
                    )}
                  </td>
                  <td style={cell}>
                    <span style={{ fontWeight: 700, color: ibe.harvester ? '#16a34a' : '#dc2626' }}>
                      {ibe.harvester ? '✅' : '❌'}
                    </span>
                  </td>
                  <td style={cell}>{loading ? '—' : (stats[ibe.name]?.total ?? 0)}</td>
                  <td style={cell}>{loading ? '—' : (stats[ibe.name]?.approved ?? 0)}</td>
                  <td style={cell}>
                    {sampleUrls[ibe.name] ? (
                      <a href={sampleUrls[ibe.name]} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.8rem' }}>
                        View →
                      </a>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...cell, textAlign: 'center', color: '#6b7280' }}>No results</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
