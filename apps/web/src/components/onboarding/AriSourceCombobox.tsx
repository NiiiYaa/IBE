'use client';

import { useEffect, useRef, useState } from 'react';
import { getAriSourceList, type AriSelection, type AriSourceOption } from '@ibe/shared';
import { listVendorFlows } from '@ibe/onboarding-flows';

const ALL_OPTIONS: AriSourceOption[] = getAriSourceList(listVendorFlows());

const inputStyle: React.CSSProperties = {
  padding: '0.6rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  boxSizing: 'border-box',
  fontSize: '0.875rem',
  width: '100%',
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
  placeholder?: string;
  style?: React.CSSProperties;
}

export function AriSourceCombobox({ value, onChange, placeholder = 'Search CM / PMS / CRS…', style }: Props) {
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
  const filtered = q
    ? ALL_OPTIONS.filter(o => o.name.toLowerCase().includes(q))
    : ALL_OPTIONS;

  const hgItems = filtered.filter(o => o.kind === 'hg_has');
  const toAddItems = filtered.filter(o => o.kind === 'to_be_added');
  const hasAnyMatch = filtered.length > 0;
  const showAddOption = q.length >= 2 && !hasAnyMatch;

  function select(opt: AriSourceOption) {
    if (opt.kind === 'hg_has') {
      onChange({ kind: 'hg_has', pmsId: opt.pmsId, name: opt.name });
    } else {
      onChange({ kind: 'to_be_added', name: opt.name });
    }
    setInputText(opt.name);
    setOpen(false);
  }

  function selectCustom() {
    const name = inputText.trim();
    if (!name) return;
    onChange({ kind: 'to_be_checked', name });
    setOpen(false);
  }

  function clear() {
    setInputText('');
    onChange(null);
    setOpen(true);
  }

  const badge = value
    ? value.kind === 'hg_has'
      ? { label: '✓ HG Connected', color: '#15803d', bg: '#dcfce7', border: '#86efac' }
      : value.kind === 'to_be_added'
        ? { label: '+ To Be Added', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' }
        : { label: '? To Be Checked', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' }
    : null;

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={inputText}
          autoComplete="off"
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={e => {
            setInputText(e.target.value);
            onChange(null);
            setOpen(true);
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && showAddOption) { e.preventDefault(); selectCustom(); }
          }}
          style={inputStyle}
        />
        {inputText && (
          <button type="button" onClick={clear}
            style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1, padding: '0.2rem' }}>
            ×
          </button>
        )}
      </div>

      {badge && (
        <div style={{ marginTop: '0.3rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: badge.bg, border: `1px solid ${badge.border}`, fontSize: '0.75rem', fontWeight: 600, color: badge.color }}>
          {badge.label}
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
          marginTop: '2px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxHeight: '280px', overflowY: 'auto',
        }}>
          {hgItems.length > 0 && (
            <div>
              <div style={sectionHeaderStyle}>✓ HG Connected</div>
              {hgItems.map(o => (
                <div key={o.kind === 'hg_has' ? o.pmsId : o.name} onMouseDown={() => select(o)}
                  style={{ padding: '0.45rem 0.75rem 0.45rem 1.25rem', cursor: 'pointer', fontSize: '0.875rem', color: '#1e293b' }}
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
                  style={{ padding: '0.45rem 0.75rem 0.45rem 1.25rem', cursor: 'pointer', fontSize: '0.875rem', color: '#1e293b' }}
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
                style={{ padding: '0.45rem 0.75rem 0.45rem 1.25rem', cursor: 'pointer', fontSize: '0.875rem', color: '#92400e', fontStyle: 'italic' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef9c3')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Add &quot;{inputText.trim()}&quot; — flag for HG team
              </div>
            </div>
          )}

          {!hasAnyMatch && !showAddOption && (
            <div style={{ padding: '0.75rem', color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center' }}>
              Keep typing to add as unknown…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
