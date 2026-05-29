'use client';

import { useEffect, useRef, useState } from 'react';
import { ARI_SYSTEMS, CATEGORY_LABELS, type AriSystem } from '@/lib/ari-systems';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

const CAT_ORDER: AriSystem['category'][] = ['PMS', 'CM', 'CRS'];
const inputStyle = { padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' as const, fontSize: '0.875rem' };

export function AriSystemCombobox({ value, onChange, placeholder = 'Search PMS / Channel Manager / CRS…', style }: Props) {
  const [inputText, setInputText] = useState(value);
  const [open, setOpen] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [confirmed, setConfirmed] = useState(false); // true after user clicks Save in free-text mode
  const ref = useRef<HTMLDivElement>(null);

  // Sync when value changes externally — but not while user is in free-text mode
  useEffect(() => { if (!showOther) setInputText(value); }, [value, showOther]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function clearAll() {
    setShowOther(false);
    setConfirmed(false);
    setInputText('');
    onChange('');
    setOpen(false);
  }

  function saveOther() {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setConfirmed(true);
    onChange(trimmed);
  }

  const q = inputText.toLowerCase();
  const filtered = q ? ARI_SYSTEMS.filter(s => s.name.toLowerCase().includes(q)) : ARI_SYSTEMS;
  const grouped = CAT_ORDER.map(cat => ({ cat, items: filtered.filter(s => s.category === cat) })).filter(g => g.items.length > 0);
  const exactMatch = ARI_SYSTEMS.some(s => s.name.toLowerCase() === q);

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      {/* ── Confirmed free-text ─────────────────────────────────────── */}
      {showOther && confirmed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
          <span style={{ fontSize: '0.875rem', color: '#15803d', fontWeight: 600, flex: 1 }}>✓ {inputText}</span>
          <button type="button" onClick={clearAll}
            style={{ fontSize: '0.75rem', color: '#6b7280', background: 'transparent', border: '1px solid #d1d5db', borderRadius: '4px', padding: '0.2rem 0.55rem', cursor: 'pointer' }}>
            Clear
          </button>
        </div>
      )}

      {/* ── Free-text typing mode ───────────────────────────────────── */}
      {showOther && !confirmed && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            value={inputText}
            autoFocus
            placeholder="Type the CM / PMS / CRS name…"
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveOther(); } }}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={saveOther} disabled={!inputText.trim()}
            style={{ padding: '0.55rem 0.9rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.8rem', cursor: inputText.trim() ? 'pointer' : 'not-allowed', opacity: inputText.trim() ? 1 : 0.5, whiteSpace: 'nowrap' }}>
            Save
          </button>
          <button type="button" onClick={clearAll}
            style={{ padding: '0.55rem 0.7rem', background: 'transparent', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem', color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Clear
          </button>
        </div>
      )}

      {/* ── Searchable dropdown ─────────────────────────────────────── */}
      {!showOther && (
        <>
          <input
            type="text"
            value={inputText}
            autoComplete="off"
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={e => {
              setInputText(e.target.value);
              onChange('');
              setOpen(true);
            }}
            style={{ ...inputStyle, width: '100%' }}
          />
          {open && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
              margin: '2px 0 0', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              maxHeight: '280px', overflowY: 'auto',
            }}>
              {grouped.map(g => (
                <div key={g.cat}>
                  <div style={{ padding: '0.3rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f9fafb', borderTop: '1px solid #f3f4f6', position: 'sticky', top: 0 }}>
                    {CATEGORY_LABELS[g.cat]}
                  </div>
                  {g.items.map(s => (
                    <div key={s.name}
                      onMouseDown={() => { setInputText(s.name); onChange(s.name); setOpen(false); }}
                      style={{ padding: '0.45rem 0.75rem 0.45rem 1.25rem', cursor: 'pointer', fontSize: '0.875rem', color: '#1e293b' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      {s.name}
                    </div>
                  ))}
                </div>
              ))}
              {/* Enter manually option */}
              {!exactMatch && (
                <div
                  onMouseDown={() => { setShowOther(true); setInputText(''); onChange(''); setOpen(false); }}
                  style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic', borderTop: '1px solid #e5e7eb' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  Not in this list — enter name manually
                </div>
              )}
              {grouped.length === 0 && (
                <div style={{ padding: '0.75rem', color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center' }}>
                  No match —{' '}
                  <span style={{ cursor: 'pointer', textDecoration: 'underline', color: '#6b7280' }}
                    onMouseDown={() => { setShowOther(true); setInputText(inputText); setOpen(false); }}>
                    enter &quot;{inputText}&quot; manually
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
