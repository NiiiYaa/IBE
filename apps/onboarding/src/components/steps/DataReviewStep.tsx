'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { WizardState } from '@/lib/api';

interface Props {
  step: { id: string; title: string; description: string };
  state: WizardState;
  onComplete: () => void;
}

const EDITABLE_FIELDS = [
  { key: 'hotelName', label: 'Hotel Name', type: 'text', required: true },
  { key: 'city', label: 'City', type: 'text', required: true },
  { key: 'countryCode', label: 'Country Code (2-letter)', type: 'text', required: true },
  { key: 'contactEmail', label: 'Contact Email', type: 'email', required: false },
  { key: 'starRating', label: 'Star Rating (1-5)', type: 'number', required: false },
  { key: 'roomCount', label: 'Number of Rooms', type: 'number', required: false },
];

export function DataReviewStep({ step, state, onComplete }: Props) {
  const enriched = state.enrichedData ?? {};
  const isBlank = state.dataFlow === 'blank';
  const rooms = state.harvestedRooms ?? [];

  const [fields, setFields] = useState<Record<string, string>>(
    Object.fromEntries(EDITABLE_FIELDS.map(f => [f.key, String(enriched[f.key] ?? '')]))
  );
  const [roomCodes, setRoomCodes] = useState<Record<string, string>>(
    Object.fromEntries(rooms.map(r => [r.name, String((enriched['roomCodes'] as Record<string, string> | undefined)?.[r.name] ?? '')]))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extendStatus, setExtendStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: '', maxAdults: 2, maxOccupancy: 2, bedConfiguration: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields['hotelName']?.trim()) { setError('Hotel name is required'); return; }
    if (!fields['city']?.trim()) { setError('City is required'); return; }
    if (!fields['countryCode']?.trim() || fields['countryCode'].length !== 2) { setError('Country code must be 2 letters'); return; }
    if (isBlank) {
      for (const room of rooms) {
        if (!roomCodes[room.name]?.trim()) { setError(`Enter CM code for room: ${room.name}`); return; }
      }
    }
    setError(null);
    setLoading(true);
    try {
      await api.confirmReview({ ...enriched, ...fields, ...(isBlank ? { roomCodes } : {}) });
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  function handleExtendHarvest() {
    setExtendStatus('running');
    const es = new EventSource(api.extendHarvestUrl(), { withCredentials: true });
    es.onmessage = (e) => {
      const evt = JSON.parse(e.data as string);
      if (evt.type === 'complete') { setExtendStatus('done'); es.close(); onComplete(); }
      if (evt.type === 'error') { setExtendStatus('idle'); setError(`Extended search failed: ${evt.message ?? 'unknown error'}`); es.close(); }
    };
    es.onerror = () => { setExtendStatus('idle'); setError('Extended search connection failed'); es.close(); };
  }

  async function handleAddRoom() {
    if (!newRoom.name.trim()) return;
    try {
      await api.addRoomManually(newRoom);
      setShowAddRoom(false);
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add room');
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>{step.title}</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>{step.description}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {EDITABLE_FIELDS.map(f => (
          <div key={f.key}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>{f.label}</label>
            <input type={f.type} value={fields[f.key] ?? ''} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
        ))}

        {isBlank && rooms.length > 0 && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Room type codes (must match your SiteMinder codes exactly)</p>
            {rooms.map(room => (
              <div key={room.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{room.name}</span>
                <input type="text" placeholder="SM room code" value={roomCodes[room.name] ?? ''}
                  onChange={e => setRoomCodes(p => ({ ...p, [room.name]: e.target.value }))}
                  style={{ width: '160px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              </div>
            ))}
          </div>
        )}

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Found {rooms.length} room type{rooms.length !== 1 ? 's' : ''}. Does this look complete?</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {extendStatus === 'idle' && (
              <button type="button" onClick={handleExtendHarvest}
                style={{ padding: '0.4rem 0.9rem', border: '1px solid #d97706', borderRadius: '5px', background: 'transparent', color: '#92400e', cursor: 'pointer', fontSize: '0.85rem' }}>
                Run extended search
              </button>
            )}
            {extendStatus === 'running' && <span style={{ color: '#92400e', fontSize: '0.85rem' }}>Searching…</span>}
            {extendStatus === 'done' && <span style={{ color: '#065f46', fontSize: '0.85rem' }}>✓ Extended search complete</span>}
            <button type="button" onClick={() => setShowAddRoom(v => !v)}
              style={{ padding: '0.4rem 0.9rem', border: '1px solid #d1d5db', borderRadius: '5px', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}>
              + Add a room manually
            </button>
          </div>
        </div>

        {showAddRoom && (
          <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontWeight: 600, margin: 0 }}>Add a room we didn&apos;t find</p>
            <input type="text" placeholder="Room name" required value={newRoom.name}
              onChange={e => setNewRoom(p => ({ ...p, name: e.target.value }))}
              style={{ padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input type="number" placeholder="Max adults" min={1} max={10} value={newRoom.maxAdults}
                onChange={e => setNewRoom(p => ({ ...p, maxAdults: parseInt(e.target.value) }))}
                style={{ flex: 1, padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              <input type="number" placeholder="Max occupancy" min={1} max={10} value={newRoom.maxOccupancy}
                onChange={e => setNewRoom(p => ({ ...p, maxOccupancy: parseInt(e.target.value) }))}
                style={{ flex: 1, padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              <input type="text" placeholder="Bed config (e.g. 1 King)" value={newRoom.bedConfiguration}
                onChange={e => setNewRoom(p => ({ ...p, bedConfiguration: e.target.value }))}
                style={{ flex: 2, padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
            </div>
            <button type="button" onClick={(e) => { e.preventDefault(); handleAddRoom(); }} style={{ padding: '0.6rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Add Room</button>
          </div>
        )}

        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ padding: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Confirm & Continue'}
        </button>
      </form>
    </div>
  );
}
