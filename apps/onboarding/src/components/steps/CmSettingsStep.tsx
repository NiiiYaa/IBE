'use client';

import { useState } from 'react';
import { api, type WizardState, type RatePlanRow } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  state: WizardState;
  onComplete: () => void;
}

const PRICING_MODELS = ['per_room', 'per_occupancy', 'per_person'] as const;
const BOARD_NAMES: Record<string, string> = {
  RO: 'Room Only', BB: 'Bed & Breakfast', HB: 'Half Board', FB: 'Full Board', AI: 'All Inclusive',
};
const TAX_RELATIONS = ['included', 'add', 'display', 'optional', 'ignore'] as const;

export function CmSettingsStep({ step, state, onComplete }: Props) {
  const ratePlanTypes = state.harvestedRatePlanTypes ?? [];
  const taxes = state.harvestedTaxes ?? [];

  function buildInitialRows(): RatePlanRow[] {
    const rows: RatePlanRow[] = [];
    for (const rpt of ratePlanTypes) {
      if (rpt.hasRefundable) {
        rows.push({
          boardCode: rpt.boardCode as RatePlanRow['boardCode'],
          boardCodeRawName: rpt.boardCodeRawName,
          isRefundable: true,
          pmsRateplanCode: '',
          priceType: 'gross',
          commissionPercent: 15,
          charge: 'agent',
          cancellationPolicy: rpt.refundableCancellationPolicy,
        });
      }
      if (rpt.hasNonRefundable) {
        rows.push({
          boardCode: rpt.boardCode as RatePlanRow['boardCode'],
          boardCodeRawName: rpt.boardCodeRawName,
          isRefundable: false,
          pmsRateplanCode: '',
          priceType: 'gross',
          commissionPercent: 15,
          charge: 'agent',
          cancellationPolicy: { type: 'non_refundable' },
        });
      }
    }
    return rows;
  }

  const [currency, setCurrency] = useState('');
  const [pricingModel, setPricingModel] = useState<'per_room' | 'per_occupancy' | 'per_person'>('per_room');
  const [rows, setRows] = useState<RatePlanRow[]>(buildInitialRows);
  const [taxRelations, setTaxRelations] = useState<Record<string, string>>(
    Object.fromEntries(taxes.map(t => [t.name, 'add']))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateRow(idx: number, patch: Partial<RatePlanRow>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function addRow() {
    setRows(prev => [...prev, {
      boardCode: 'RO', boardCodeRawName: 'Room Only', isRefundable: true,
      pmsRateplanCode: '', priceType: 'gross', commissionPercent: 15, charge: 'agent', cancellationPolicy: null,
    }]);
  }

  const missingMinimum = (() => {
    const has = (bc: string, refundable: boolean) => rows.some(r => r.boardCode === bc && r.isRefundable === refundable);
    const missing = [];
    if (!has('RO', true)) missing.push('RO Refundable');
    if (!has('RO', false)) missing.push('RO Non-Refundable');
    if (!has('BB', true)) missing.push('BB Refundable');
    if (!has('BB', false)) missing.push('BB Non-Refundable');
    return missing;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currency.trim()) { setError('Currency is required (e.g. EUR, USD)'); return; }
    if (rows.length === 0) { setError('At least one rate plan is required'); return; }
    setError(null);
    setLoading(true);
    try {
      await api.submitCmSettings({ currency, pricingModel, ratePlans: rows, taxRelations });
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = { padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.85rem' } as const;

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Block 1: property-level settings */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Currency</label>
            <input type="text" placeholder="EUR" maxLength={3} value={currency}
              onChange={e => setCurrency(e.target.value.toUpperCase())}
              style={{ ...inputStyle, width: '80px', textTransform: 'uppercase' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Pricing model</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {PRICING_MODELS.map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="radio" name="pricingModel" value={m} checked={pricingModel === m} onChange={() => setPricingModel(m)} />
                  {m.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Block 2: rate plan mapping table */}
        <div>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Rate plan mapping</p>
          {missingMinimum.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.6rem 0.9rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#92400e' }}>
              ⚠ HG requires at least: {missingMinimum.join(', ')}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Board', 'R/NR', 'CM Code', 'Price type', 'Commission', 'Charge'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <select value={row.boardCode} onChange={e => updateRow(idx, { boardCode: e.target.value as RatePlanRow['boardCode'] })} style={inputStyle}>
                        {Object.entries(BOARD_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <span style={{ fontSize: '0.8rem', color: row.isRefundable ? '#065f46' : '#991b1b', fontWeight: 600 }}>
                        {row.isRefundable ? 'R' : 'NR'}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <input type="text" placeholder="e.g. FLEX-BB" value={row.pmsRateplanCode}
                        onChange={e => updateRow(idx, { pmsRateplanCode: e.target.value })}
                        style={{ ...inputStyle, width: '120px' }} />
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <select value={row.priceType} onChange={e => updateRow(idx, { priceType: e.target.value as 'gross' | 'net' })} style={inputStyle}>
                        <option value="gross">gross</option>
                        <option value="net">net</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', whiteSpace: 'nowrap' }}>
                      <input type="number" min={0} max={100} value={row.commissionPercent}
                        onChange={e => updateRow(idx, { commissionPercent: parseFloat(e.target.value) || 0 })}
                        style={{ ...inputStyle, width: '55px' }} /> %
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <select value={row.charge} onChange={e => updateRow(idx, { charge: e.target.value as 'agent' | 'customer' })} style={inputStyle}>
                        <option value="agent">agent</option>
                        <option value="customer">customer</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addRow}
            style={{ marginTop: '0.5rem', padding: '0.35rem 0.8rem', border: '1px solid #d1d5db', borderRadius: '5px', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem' }}>
            + Add rate plan
          </button>
        </div>

        {/* Block 3: tax relations */}
        {taxes.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Tax &amp; fee relations</p>
            {taxes.map(tax => (
              <div key={tax.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.4rem' }}>
                <span style={{ flex: 2, fontSize: '0.875rem' }}>
                  {tax.name}{tax.amount ? ` (${tax.amount})` : ''}
                  {tax.source === 'lookup' && <span style={{ color: '#d97706', fontSize: '0.75rem' }}> ⚠ estimated</span>}
                </span>
                <select value={taxRelations[tax.name] ?? 'add'}
                  onChange={e => setTaxRelations(p => ({ ...p, [tax.name]: e.target.value }))}
                  style={{ ...inputStyle, width: '120px' }}>
                  {TAX_RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Save & Continue'}
        </button>
      </form>
    </div>
  );
}
