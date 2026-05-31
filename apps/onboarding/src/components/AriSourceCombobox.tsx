'use client';

import { useEffect, useRef, useState } from 'react';
import { getAriSourceList, type AriSelection, type AriSourceOption } from '@ibe/shared';
import { listVendorFlows } from '@ibe/onboarding-flows';

const ALL_OPTIONS: AriSourceOption[] = getAriSourceList(listVendorFlows());

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '1rem',
  boxSizing: 'border-box',
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '0.3rem 0.75rem',
  fontSize: '0.7rem',
  fontWeight: 700,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  background: '#f9fafb',
  borderTop: '1px solid #f3f4f6',
  position: 'sticky',
  top: 0,
};

interface Props {
  value: AriSelection | null;
  onChange: (value: AriSelection | null) => void;
}

export function AriSourceCombobox({ value, onChange }: Props) {
  const [inputText, setInputText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputText(value?.name ?? ''); }, [value]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const q = inputText.toLowerCase();
  const filtered = q ? ALL_OPTIONS.filter(o => o.name.toLowerCase().includes(q)) : ALL_OPTIONS;
  const hgItems = filtered.filter(o => o.kind === 'hg_has');
  const toAddItems = filtered.filter(o => o.kind === 'to_be_added');
  const showAddOption = q.length >= 2 && filtered.length === 0;

  function select(opt: AriSourceOption) {
    if (opt.kind === 'hg_has') onChange({ kind: 'hg_has', pmsId: opt.pmsId, name: opt.name });
    else onChange({ kind: 'to_be_added', name: opt.name });
    setInputText(opt.name);
    setOpen(false);
  }

  function selectCustom() {
    const name = inputText.trim();
    if (!name) return;
    onChange({ kind: 'to_be_checked', name });
    setOpen(false);
  }

  const badgeMap = {
    hg_has:        { label: '✓ HG Connected',  color: '#15803d', bg: '#dcfce7', border: '#86efac' },
    to_be_added:   { label: '+ To Be Added',   color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
    to_be_checked: { label: '? To Be Checked', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
  };
  const badge = value ? badgeMap[value.kind] : null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={inputText}
          autoComplete="off"
          placeholder="Search your Channel Manager / PMS / CRS…"
          onFocus={() => setOpen(true)}
          onChange={e => { setInputText(e.target.value); onChange(null); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && showAddOption) { e.preventDefault(); selectCustom(); }
          }}
          style={inputStyle}
        />
        {inputText && (
          <button type="button" onClick={() => { setInputText(''); onChange(null); setOpen(true); }}
            style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.1rem', lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {badge && (
        <div style={{ marginTop: '0.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.7rem', borderRadius: '999px', background: badge.bg, border: `1px solid ${badge.border}`, fontSize: '0.8rem', fontWeight: 600, color: badge.color }}>
          {badge.label}
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
          marginTop: '2px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxHeight: '300px', overflowY: 'auto',
        }}>
          {hgItems.length > 0 && (
            <div>
              <div style={sectionHeaderStyle}>✓ HG Connected</div>
              {hgItems.map(o => (
                <div key={o.kind === 'hg_has' ? o.pmsId : o.name} onMouseDown={() => select(o)}
                  style={{ padding: '0.55rem 0.75rem 0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.95rem', color: '#1e293b' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {o.name}
                </div>
              ))}
            </div>
          )}

          {toAddItems.length > 0 && (
            <div>
              <div style={{ ...sectionHeaderStyle, borderTop: hgItems.length > 0 ? '1px solid #e5e7eb' : undefined }}>
                + To Be Added
              </div>
              {toAddItems.map(o => (
                <div key={o.name} onMouseDown={() => select(o)}
                  style={{ padding: '0.55rem 0.75rem 0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.95rem', color: '#1e293b' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {o.name}
                </div>
              ))}
            </div>
          )}

          {showAddOption && (
            <div>
              <div style={{ ...sectionHeaderStyle, borderTop: '1px solid #e5e7eb' }}>? To Be Checked</div>
              <div onMouseDown={selectCustom}
                style={{ padding: '0.55rem 0.75rem 0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.95rem', color: '#92400e', fontStyle: 'italic' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef9c3')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Add &quot;{inputText.trim()}&quot; — we&apos;ll set it up for you
              </div>
            </div>
          )}

          {filtered.length === 0 && !showAddOption && (
            <div style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.9rem', textAlign: 'center' }}>
              Keep typing to add as unknown…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
