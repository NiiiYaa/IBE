'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

type QueueItem = {
  id: number;
  hotelName: string | null;
  source: string;
  harvestStatus: string;
  harvestQueuedAt: string | null;
  harvestStartedAt: string | null;
  ibeUrl: string | null;
  ibePattern: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  self_registration: 'Self-onboarding',
  staff_invite: 'OB Agent',
  zoho: 'CRM',
};
const SOURCE_PRIORITY: Record<string, number> = {
  self_registration: 3,
  staff_invite: 2,
  zoho: 1,
};
const PRIORITY_LABEL: Record<number, { label: string; bg: string; color: string }> = {
  3: { label: 'High', bg: '#dcfce7', color: '#166534' },
  2: { label: 'Normal', bg: '#dbeafe', color: '#1e40af' },
  1: { label: 'Low', bg: '#f3f4f6', color: '#6b7280' },
};

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function elapsed(iso: string | null) {
  if (!iso) return '';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export default function HarvestQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  async function load() {
    try { setItems(await apiClient.listHarvestQueue()); } catch (e) { console.error('harvest-queue fetch failed', e) }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const poll = setInterval(load, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  const running = items.filter(i => i.harvestStatus === 'harvesting');
  const queued  = items.filter(i => i.harvestStatus === 'queued');

  async function cancel(id: number) {
    if (!confirm('Remove this job from the queue?')) return;
    await apiClient.cancelHarvestQueue(id);
    await load();
  }
  async function setPriority(id: number, p: 'high' | 'low') {
    await apiClient.setHarvestQueuePriority(id, p);
    await load();
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem' }}>Harvest Queue</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
            One harvest runs at a time. Priority: Self-onboarding → OB Agent → CRM
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
            {running.length} running
          </span>
          <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
            {queued.length} waiting
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', padding: '2rem', textAlign: 'center' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
          Queue is empty — no harvests running or waiting.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['#', 'Hotel', 'IBE', 'Source', 'Priority', 'Status', 'Queued', 'Elapsed', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.8rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const isRunning = item.harvestStatus === 'harvesting';
                const pri = SOURCE_PRIORITY[item.source] ?? 0;
                const priInfo = PRIORITY_LABEL[pri] ?? PRIORITY_LABEL[0];
                const elapsedSec = item.harvestStartedAt
                  ? Math.floor((now - new Date(item.harvestStartedAt).getTime()) / 1000)
                  : null;
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #e5e7eb', background: isRunning ? '#f0fdf4' : undefined }}>
                    <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.78rem' }}>{idx + 1}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                      {item.hotelName ?? '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#6b7280' }}>
                      {item.ibePattern ?? (item.ibeUrl ? (() => { try { return new URL(item.ibeUrl!).hostname } catch { return '—' } })() : '—')}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem' }}>
                      {SOURCE_LABEL[item.source] ?? item.source}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ background: priInfo?.bg, color: priInfo?.color, padding: '1px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                        {priInfo?.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {isRunning ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#d1fae5', color: '#065f46', padding: '1px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                          <span style={{ display: 'inline-block', animation: 'spin 1.8s linear infinite' }}>⏳</span> Running
                        </span>
                      ) : (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                          Waiting
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#6b7280' }}>
                      {fmtTime(item.harvestQueuedAt)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                      {isRunning && elapsedSec !== null
                        ? `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`
                        : item.harvestQueuedAt ? elapsed(item.harvestQueuedAt) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        {!isRunning && (
                          <>
                            <button onClick={() => setPriority(item.id, 'high')}
                              style={{ padding: '0.2rem 0.5rem', border: '1px solid #16a34a', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem', background: 'transparent', color: '#16a34a' }}
                              title="Move to front">↑ Front</button>
                            <button onClick={() => setPriority(item.id, 'low')}
                              style={{ padding: '0.2rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem', background: 'transparent', color: '#6b7280' }}
                              title="Move to back">↓ Back</button>
                          </>
                        )}
                        <button onClick={() => cancel(item.id)}
                          style={{ padding: '0.2rem 0.5rem', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem', background: 'transparent', color: '#dc2626' }}
                          title={isRunning ? 'Kill running harvest' : 'Remove from queue'}>
                          {isRunning ? '✕ Kill' : '✕'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
