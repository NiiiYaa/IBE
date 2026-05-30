'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient, type BlockedDomain } from '@/lib/api-client';
import { COUNTRIES, countryFlag } from '@/lib/countries';

const inputStyle = { padding: '0.55rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' as const, fontSize: '0.875rem' };

const MATCH_TYPES = [
  {
    value: 'subdomain', label: 'Subdomain', bg: '#d1fae5', color: '#065f46',
    description: 'Blocks the domain and all its subdomains.',
    example: 'booking.com → blocks booking.com, www.booking.com, deals.booking.com',
  },
  {
    value: 'exact', label: 'Exact', bg: '#dbeafe', color: '#1d4ed8',
    description: 'Blocks only the exact hostname — subdomains are not blocked.',
    example: 'booking.com → blocks booking.com only, NOT deals.booking.com',
  },
  {
    value: 'brand', label: 'Brand', bg: '#fef9c3', color: '#92400e',
    description: 'Blocks a brand on any country TLD. Enter the brand name without TLD.',
    example: 'booking → blocks booking.com, booking.ie, booking.co.uk, booking.fr …',
  },
  {
    value: 'keyword', label: 'Keyword', bg: '#f3e8ff', color: '#6b21a8',
    description: 'Blocks any hostname that contains this text anywhere.',
    example: 'tourism → blocks paristourism.com, tourismthailand.org, malta-tourism.eu …',
  },
]

function MatchBadge({ type }: { type: string }) {
  const mt = MATCH_TYPES.find(m => m.value === type) ?? MATCH_TYPES[0]!;
  return (
    <span style={{ background: mt.bg, color: mt.color, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
      {mt.label}
    </span>
  );
}

export default function BlockedDomainsPage() {
  const [domains, setDomains] = useState<BlockedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [addUrl, setAddUrl] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addMatchType, setAddMatchType] = useState('subdomain');
  const [addCountryCode, setAddCountryCode] = useState('');   // ISO-2 or '' for Global
  const [addCountryInput, setAddCountryInput] = useState('Global');
  const [countryOpen, setCountryOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);
  const countryInputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setDomains(await apiClient.listBlockedDomains()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addUrl.trim()) return;
    setAdding(true); setAddError(null);
    try {
      await apiClient.addBlockedDomain({
        url: addUrl.trim(),
        ...(addLabel.trim() ? { label: addLabel.trim() } : {}),
        matchType: addMatchType,
        ...(addCountryCode ? { country: addCountryCode } : {}),
      });
      setAddUrl(''); setAddLabel(''); setAddMatchType('subdomain');
      setAddCountryCode(''); setAddCountryInput('Global');
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add');
    } finally { setAdding(false); }
  }

  async function handleRemove(id: number) {
    if (!confirm('Remove this domain from the blacklist?')) return;
    await apiClient.removeBlockedDomain(id);
    await load();
  }

  async function changeMatchType(d: BlockedDomain, newType: string) {
    await apiClient.updateBlockedDomain(d.id, { matchType: newType });
    await load();
  }

  const q = filter.toLowerCase();
  const filtered = domains.filter(d =>
    (typeFilter === 'all' || d.matchType === typeFilter) &&
    (!q || d.domain.includes(q) || (d.label ?? '').toLowerCase().includes(q) || (d.country ?? '').toLowerCase().includes(q))
  );

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Blacklist</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        All domains blocked from hotel search results. Includes built-in rules and custom additions. Click a match-type badge to cycle through types.
      </p>

      {/* Add form */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Add to Blacklist</h2>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.25rem' }}>URL or Domain *</label>
              <input type="text" required value={addUrl} onChange={e => setAddUrl(e.target.value)}
                placeholder="e.g. hotelsinsofia.net" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.25rem' }}>Label</label>
              <input type="text" value={addLabel} onChange={e => setAddLabel(e.target.value)}
                placeholder="e.g. Bulgarian OTA" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.25rem' }}>Match type</label>
              <select value={addMatchType} onChange={e => setAddMatchType(e.target.value)}
                style={{ ...inputStyle, width: '100%', marginBottom: '0.4rem' }}>
                {MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {(() => {
                const mt = MATCH_TYPES.find(m => m.value === addMatchType)!;
                return (
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
                    <span>{mt.description}</span>
                    <span style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.73rem', color: '#9ca3af', marginTop: '0.15rem' }}>{mt.example}</span>
                  </div>
                );
              })()}
            </div>
            <div ref={countryRef} style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.25rem' }}>Country</label>
              <input
                ref={countryInputRef}
                type="text"
                value={addCountryInput}
                autoComplete="off"
                placeholder="Search countries…"
                onFocus={() => {
                  countryInputRef.current?.select();
                  setCountryOpen(true);
                }}
                onChange={e => {
                  setAddCountryInput(e.target.value);
                  setAddCountryCode('');
                  setCountryOpen(true);
                }}
                onBlur={() => {
                  // Restore committed label if user didn't pick anything new
                  setTimeout(() => {
                    if (!addCountryCode && addCountryInput !== 'Global' && !COUNTRIES.some(c => c.name === addCountryInput)) {
                      setAddCountryInput('Global');
                    }
                  }, 200);
                }}
                style={{ ...inputStyle, width: '100%' }}
              />
              {countryOpen && (
                <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', margin: '2px 0 0', padding: 0, listStyle: 'none', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
                  {/* Global — always first */}
                  <li onMouseDown={() => { setAddCountryCode(''); setAddCountryInput('Global'); setCountryOpen(false); }}
                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, borderBottom: '1px solid #e5e7eb', color: '#374151', background: !addCountryCode ? '#f0fdf4' : 'transparent' }}>
                    🌐 Global
                  </li>
                  {/* Countries — show all when default, filter when user types */}
                  {COUNTRIES
                    .filter(c => {
                      const q = addCountryInput === 'Global' ? '' : addCountryInput.toLowerCase();
                      return q === '' || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
                    })
                    .map(c => (
                      <li key={c.code}
                        onMouseDown={() => { setAddCountryCode(c.code); setAddCountryInput(c.name); setCountryOpen(false); }}
                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{countryFlag(c.code)}</span>
                        <span>{c.name}</span>
                      </li>
                    ))
                  }
                </ul>
              )}
            </div>
          </div>
          {addError && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{addError}</p>}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button type="submit" disabled={adding}
              style={{ padding: '0.55rem 1.4rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.7 : 1 }}>
              {adding ? 'Adding…' : '+ Add to Blacklist'}
            </button>
            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              Country = Global means blocked in all searches. Country-specific rules are stored for future use.
            </span>
          </div>
        </form>
      </div>

      {/* List */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.5rem', borderBottom: '1px solid #e5e7eb', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{domains.length} entries</span>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ ...inputStyle, fontSize: '0.78rem', padding: '0.3rem 0.5rem' }}>
              <option value="all">All types</option>
              {MATCH_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter by domain, label, country…"
            style={{ ...inputStyle, width: '240px' }} />
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
            {filter || typeFilter !== 'all' ? 'No match.' : 'No entries yet.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {[
                  { label: 'Domain / Pattern', width: '220px' },
                  { label: 'Label',            width: undefined },
                  { label: 'Type',             width: '130px' },
                  { label: 'Country',          width: '120px' },
                  { label: 'Added by',         width: '130px' },
                  { label: 'Actions',          width: '120px' },
                ].map(h => (
                  <th key={h.label} style={{ padding: '0.7rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.8rem', width: h.width }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const country = d.country ? COUNTRIES.find(c => c.code === d.country) : null;
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.82rem', color: '#1e293b' }}>{d.domain}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.82rem' }}>{d.label ?? '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '110px' }}>
                        <MatchBadge type={d.matchType} />
                        <select
                          value={d.matchType}
                          title={MATCH_TYPES.find(m => m.value === d.matchType)?.description}
                          onChange={e => changeMatchType(d, e.target.value)}
                          style={{ fontSize: '0.72rem', padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: '4px', color: '#6b7280', background: '#fff', cursor: 'pointer', width: '110px' }}>
                          {MATCH_TYPES.map(m => <option key={m.value} value={m.value} title={m.description}>{m.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem' }}>
                      {country ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span>{countryFlag(country.code)}</span>
                          <span style={{ color: '#374151' }}>{country.name}</span>
                        </span>
                      ) : <span style={{ color: '#9ca3af' }}>Global</span>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#374151' }}>
                      {d.addedByAdmin
                        ? d.addedByAdmin.name
                        : <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: '4px' }}>Built-in</span>
                      }
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {(d.matchType === 'subdomain' || d.matchType === 'exact') && (
                          <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer"
                            style={{ padding: '0.25rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.78rem', color: '#374151', textDecoration: 'none' }}>
                            View ↗
                          </a>
                        )}
                        {d.matchType === 'brand' && (
                          <a href={`https://www.${d.domain}.com`} target="_blank" rel="noopener noreferrer"
                            style={{ padding: '0.25rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.78rem', color: '#374151', textDecoration: 'none' }}>
                            View ↗
                          </a>
                        )}
                        <button onClick={() => handleRemove(d.id)}
                          style={{ padding: '0.25rem 0.6rem', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '0.78rem', color: '#dc2626', background: 'transparent', cursor: 'pointer' }}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
