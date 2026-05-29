'use client';

import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { apiClient } from '@/lib/api-client';

type PreAction = { title: string; instruction: string; contactEmail?: string };
type Step = { id: string; kind: string; title: string; description: string };
type AriSource = {
  pmsId: number; pmsName: string; dataFlow: string;
  useDefaultCodes: boolean; regionAware: boolean;
  requiresStaffChannelSetup: boolean; stepCount: number;
  kbVerified: boolean; preActions: PreAction[]; steps: Step[];
};

const DATA_FLOW_LABEL: Record<string, string> = {
  blank:        'Standard',
  hg_pulls:     'HG Pulls',
  reverse_pull: 'CM Pulls',
};
const DATA_FLOW_STYLE: Record<string, { bg: string; color: string }> = {
  blank:        { bg: '#f3f4f6', color: '#374151' },
  hg_pulls:     { bg: '#dbeafe', color: '#1d4ed8' },
  reverse_pull: { bg: '#f3e8ff', color: '#6b21a8' },
};
const STEP_KIND_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  automated:          { bg: '#dbeafe', color: '#1d4ed8', label: 'Auto' },
  user_action:        { bg: '#fef9c3', color: '#92400e', label: 'Hotel action' },
  credentials:        { bg: '#f3e8ff', color: '#6b21a8', label: 'Credentials' },
  data_review:        { bg: '#d1fae5', color: '#065f46', label: 'Review' },
  cm_settings:        { bg: '#ffe4e6', color: '#9f1239', label: 'CM settings' },
  candidate_search:   { bg: '#f3f4f6', color: '#374151', label: 'Search' },
  ari_source_selection: { bg: '#f3f4f6', color: '#374151', label: 'ARI select' },
};

const COLUMN_INFO: Record<string, { title: string; body: string }> = {
  'HG ID': {
    title: 'HG ID (pmsId)',
    body: `The numeric identifier HyperGuest uses internally to identify this ARI source (channel manager / PMS / CRS). This ID is stored on every invitation and property in HG's back-office system. It maps directly to the \`pmsId\` field in the VendorFlow registry.`,
  },
  'Name': {
    title: 'Name',
    body: `The display name of the channel manager, PMS, or CRS as shown to hotel users in the onboarding wizard and admin panel.`,
  },
  'Data Flow': {
    title: 'Data Flow',
    body: `How availability, rates and inventory (ARI) flow between the CM and HyperGuest:

Standard — HyperGuest creates a blank property shell. The hotel fills in room/rate details during the wizard, and the CM pushes ARI updates to HG after the channel is connected. This is the most common mode.

HG Pulls — HyperGuest actively calls the CM's API to fetch rooms, rate plans and ARI. Used when the CM exposes a pull API (e.g. Hotel Link).

CM Pulls — The CM fetches its room/rate mapping from HyperGuest after setup. Less common.`,
  },
  'Flags': {
    title: 'Flags',
    body: `Special characteristics of this integration:

Staff — HyperGuest staff must take action during setup (e.g. activating the channel via an extranet, using fixed HG credentials, or waiting for an email from the CM with the property ID). The hotel cannot complete setup entirely on their own.

Auto codes — HyperGuest generates room and rate plan codes automatically (e.g. ROOM-01, FLEX-BB). No manual code entry is needed from the hotel.

Region — The connection requires region-specific configuration. For example, SiteMinder requires selecting Asia/Pacific vs. Rest of World, and Israel properties (e.g. Optima) need special infant pricing and tax settings.`,
  },
  'Steps': {
    title: 'Wizard Steps',
    body: `The total number of steps in the onboarding wizard for this CM. Click the button to see each step in detail.

Typical steps include: finding the hotel's booking engine, harvesting room data, reviewing the data, selecting the ARI source, entering CM credentials, configuring rate plans and taxes, creating the HG property, and triggering the first ARI sync.

Some CMs add extra steps — for example a "Connect channel" confirmation step where the hotel activates HyperGuest in their CM dashboard, or a "Request activation" step where the hotel must contact the CM support team first.`,
  },
  'Knowledge Base Verified': {
    title: 'Knowledge Base Verified',
    body: `Whether this wizard flow was verified against HyperGuest's internal Zoho Desk KB articles (the "Source: X" integration articles used by the onboarding team).

✓ Verified — The credential format, connection flow, and any special requirements (e.g. fixed credentials, staff-only activation, code matching rules, no-children support) were confirmed from a real KB article before this wizard was built.

✗ Not verified — No KB article was found for this CM. The wizard was built using a standard template. Credential field names and exact connection steps should be verified with the CM's support team before relying on this flow in production.`,
  },
  'Pre-actions': {
    title: 'Pre-actions',
    body: `Steps the HOTEL must complete before the wizard can proceed — specifically actions that require the CM's support team to do something on their side first.

Examples: contacting the CM to request HyperGuest be activated as a channel, filling in a content form, requesting a PRS form from Sabre, or waiting for an authentication code.

These instructions are included in the invitation email sent to the hotel, so they know what to prepare before clicking the wizard link.

"None" means the hotel can start the wizard immediately without any prior contact with their CM.`,
  },
  'Invitations': {
    title: 'Invitations',
    body: `Total number of onboarding invitations created for this ARI source across all organizations. Includes invitations in any status (in progress, pending review, approved, abandoned).`,
  },
  'Approved': {
    title: 'Approved',
    body: `Number of onboarding sessions for this ARI source that have been fully completed and approved by HyperGuest staff. A property is approved once ARI is confirmed flowing correctly and a test booking has passed.`,
  },
  'WL': {
    title: 'White Label of',
    body: `Marks this ARI source as a white-label variant of another. When set, the onboarding wizard will run the master's flow for hotels using this CM instead of looking for a separate flow.\n\nExample: Isprava is a white-label of STAAH — hotels with Isprava go through the STAAH wizard.\n\nThe invitation still records the hotel's actual CM (e.g. Isprava). Only the flow execution is redirected.`,
  },
};

type ModalContent =
  | { type: 'steps'; name: string; steps: Step[] }
  | { type: 'preactions'; name: string; actions: PreAction[] }
  | { type: 'info'; title: string; body: string }
  | null;

function Modal({ content, onClose }: { content: ModalContent; onClose: () => void }) {
  if (!content) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: '100%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {content.type === 'steps' ? 'Wizard Steps' : content.type === 'preactions' ? 'Pre-actions Required' : 'About'}
            </p>
            <h3 style={{ margin: '0.1rem 0 0', fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>
              {content.type === 'info' ? content.title : content.name}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: '#9ca3af', lineHeight: 1, padding: '0 0.25rem' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {content.type === 'info' && (
            <div style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {content.body}
            </div>
          )}
          {content.type === 'steps' && (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {content.steps.map((s, i) => {
                const ks = STEP_KIND_STYLE[s.kind] ?? { bg: '#f3f4f6', color: '#374151', label: s.kind };
                return (
                  <li key={s.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, marginTop: '1px' }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>{s.title}</span>
                        <span style={{ background: ks.bg, color: ks.color, fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', flexShrink: 0 }}>{ks.label}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5 }}>{s.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {content.type === 'preactions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {content.actions.map((a, i) => (
                <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem 1.1rem' }}>
                  <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.9rem', color: '#92400e' }}>⚡ {a.title}</p>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#374151', lineHeight: 1.6 }}>{a.instruction}</p>
                  {a.contactEmail && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                      Contact: <a href={`mailto:${a.contactEmail}`} style={{ color: '#2563eb' }}>{a.contactEmail}</a>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid #e5e7eb', textAlign: 'right' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AriSourcesPage() {
  const [sources, setSources] = useState<AriSource[]>([]);
  const [stats, setStats]     = useState<Record<number, { total: number; approved: number }>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [modal, setModal]     = useState<ModalContent>(null);
  const [wlMap, setWlMap]               = useState<Record<string, number>>({});
  const [editingWlFor, setEditingWlFor] = useState<number | null>(null);
  const [wlInput, setWlInput]           = useState('');
  const [wlSaving, setWlSaving]         = useState<Record<number, boolean>>({});
  const [wlError, setWlError]           = useState<string | null>(null);
  const wlComboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      apiClient.listAriSources(),
      apiClient.getOnboardingStats().catch(() => ({ ariStats: {}, ibeStats: {}, ibeSampleUrls: {} })),
      apiClient.listAriWhiteLabels().catch(() => ({})),
    ]).then(([src, s, wl]) => {
      setSources(src);
      setStats(s.ariStats);
      setWlMap(wl);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wlComboRef.current && !wlComboRef.current.contains(e.target as Node)) {
        setEditingWlFor(null);
        setWlInput('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function saveWl(pmsId: number, masterPmsId: number) {
    setWlSaving(p => ({ ...p, [pmsId]: true }));
    try {
      await apiClient.setAriWhiteLabel(pmsId, masterPmsId);
      setWlMap(p => ({ ...p, [String(pmsId)]: masterPmsId }));
    } catch (err) {
      setWlError(err instanceof Error ? err.message : 'Failed to save');
      setTimeout(() => setWlError(null), 3000);
    } finally {
      setWlSaving(p => ({ ...p, [pmsId]: false }));
      setEditingWlFor(null);
      setWlInput('');
    }
  }

  async function clearWl(pmsId: number) {
    setWlSaving(p => ({ ...p, [pmsId]: true }));
    try {
      await apiClient.setAriWhiteLabel(pmsId, null);
      setWlMap(p => { const next = { ...p }; delete next[String(pmsId)]; return next; });
    } catch (err) {
      setWlError(err instanceof Error ? err.message : 'Failed to clear');
      setTimeout(() => setWlError(null), 3000);
    } finally { setWlSaving(p => ({ ...p, [pmsId]: false })); }
  }

  const filtered = sources.filter(s =>
    s.pmsName.toLowerCase().includes(filter.toLowerCase())
  );

  const cell: CSSProperties  = { padding: '0.75rem 1rem', verticalAlign: 'middle' };
  const hcell: CSSProperties = { ...cell, textAlign: 'left', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <Modal content={modal} onClose={() => setModal(null)} />

      <h1 style={{ marginBottom: '0.25rem' }}>ARI Sources</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        All {sources.length} registered channel manager integrations available for self-onboarding.
      </p>

      <input
        type="text" value={filter} onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name…"
        style={{ width: '100%', maxWidth: '320px', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '1rem', display: 'block' }}
      />

      {wlError && (
        <div style={{ marginBottom: '0.75rem', padding: '0.6rem 1rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '0.82rem', color: '#991b1b' }}>
          {wlError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['HG ID', 'Name', 'Data Flow', 'Flags', 'Steps', 'Knowledge Base Verified', 'Pre-actions', 'Invitations', 'Approved'].map(h => (
                  <th key={h} style={hcell}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      {h}
                      {COLUMN_INFO[h] && (
                        <button
                          onClick={() => setModal({ type: 'info', title: COLUMN_INFO[h]!.title, body: COLUMN_INFO[h]!.body })}
                          title={`About: ${h}`}
                          style={{ flexShrink: 0, background: '#e5e7eb', border: 'none', borderRadius: '50%', width: '15px', height: '15px', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, color: '#374151', lineHeight: '15px', padding: 0, textAlign: 'center' }}>
                          i
                        </button>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const flowStyle = DATA_FLOW_STYLE[s.dataFlow] ?? DATA_FLOW_STYLE['blank']!;
                return (
                  <tr key={s.pmsId} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ ...cell, fontFamily: 'monospace', color: '#6b7280', fontSize: '0.82rem' }}>{s.pmsId}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <span>{s.pmsName}</span>
                        {editingWlFor === s.pmsId ? (
                          <div ref={wlComboRef} style={{ position: 'relative' }}>
                            <input
                              autoFocus
                              type="text"
                              value={wlInput}
                              onChange={e => setWlInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Escape') { setEditingWlFor(null); setWlInput(''); } }}
                              placeholder="Search CM…"
                              style={{ width: '130px', padding: '3px 6px', border: '1px solid #2563eb', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 400 }}
                            />
                            <ul style={{
                              position: 'absolute', top: '100%', left: 0, zIndex: 50,
                              background: '#fff', border: '1px solid #d1d5db', borderRadius: '5px',
                              margin: '2px 0 0', padding: 0, listStyle: 'none',
                              maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                              minWidth: '180px',
                            }}>
                              {(() => {
                                const opts = sources.filter(o => o.pmsId !== s.pmsId && o.pmsName.toLowerCase().includes(wlInput.toLowerCase()));
                                return opts.length === 0
                                  ? <li style={{ padding: '0.4rem 0.75rem', color: '#9ca3af', fontSize: '0.78rem' }}>No match</li>
                                  : opts.map(o => (
                                    <li key={o.pmsId} onMouseDown={() => saveWl(s.pmsId, o.pmsId)}
                                      style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 400 }}
                                      onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                      {o.pmsName}
                                    </li>
                                  ));
                              })()}
                            </ul>
                          </div>
                        ) : wlMap[String(s.pmsId)] != null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 400 }}>WL:</span>
                            <span
                              onClick={() => { setEditingWlFor(s.pmsId); setWlInput(''); }}
                              title="Click to change"
                              style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {sources.find(o => o.pmsId === wlMap[String(s.pmsId)])?.pmsName ?? `#${wlMap[String(s.pmsId)]}`}
                            </span>
                            <button onClick={() => clearWl(s.pmsId)} disabled={wlSaving[s.pmsId]}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.7rem', padding: '0', lineHeight: 1 }}
                              title="Clear white-label">
                              {wlSaving[s.pmsId] ? '…' : '✕'}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingWlFor(s.pmsId); setWlInput(''); }}
                            disabled={wlSaving[s.pmsId]}
                            style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed #d1d5db', borderRadius: '3px', cursor: 'pointer', padding: '1px 6px', fontSize: '0.68rem', color: '#9ca3af', fontWeight: 400 }}>
                            {wlSaving[s.pmsId] ? '…' : '+ WL'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={cell}>
                      <span style={{ background: flowStyle.bg, color: flowStyle.color, padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}
                            title={s.dataFlow}>
                        {DATA_FLOW_LABEL[s.dataFlow] ?? s.dataFlow}
                      </span>
                    </td>
                    <td style={cell}>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {s.requiresStaffChannelSetup && <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '3px' }}>Staff</span>}
                        {s.useDefaultCodes && <span style={{ background: '#d1fae5', color: '#065f46', fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '3px' }}>Auto codes</span>}
                        {s.regionAware && <span style={{ background: '#fef9c3', color: '#92400e', fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: '3px' }}>Region</span>}
                      </div>
                    </td>
                    <td style={cell}>
                      <button
                        onClick={() => setModal({ type: 'steps', name: s.pmsName, steps: s.steps })}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '5px', cursor: 'pointer', padding: '3px 10px', color: '#374151', fontSize: '0.78rem', fontWeight: 600 }}>
                        {s.stepCount} steps
                      </button>
                    </td>
                    <td style={cell}>
                      {s.kbVerified
                        ? <span style={{ color: '#065f46', fontWeight: 700, fontSize: '0.82rem' }}>✓ Verified</span>
                        : <span style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.82rem' }}>✗ Not verified</span>}
                    </td>
                    <td style={cell}>
                      {s.preActions.length === 0
                        ? <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>None</span>
                        : (
                          <button
                            onClick={() => setModal({ type: 'preactions', name: s.pmsName, actions: s.preActions })}
                            style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '5px', cursor: 'pointer', padding: '3px 10px', color: '#92400e', fontSize: '0.78rem', fontWeight: 700 }}>
                            {s.preActions.length} action{s.preActions.length > 1 ? 's' : ''}
                          </button>
                        )}
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>{stats[s.pmsId]?.total ?? 0}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{stats[s.pmsId]?.approved ?? 0}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ ...cell, textAlign: 'center', color: '#6b7280' }}>No results</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
