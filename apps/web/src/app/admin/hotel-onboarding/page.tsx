'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient, type OnboardingInvitation, type BlockedDomain } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { AriSystemCombobox } from '@/components/onboarding/AriSystemCombobox';
import { COUNTRIES, countryFlag } from '@/lib/countries';

const PMS_OPTIONS = [
  // Batch 1 — original
  { id: 12,  name: 'SiteMinder' },
  { id: 25,  name: 'TravelClick' },
  { id: 18,  name: 'eZee Centrix' },
  { id: 88,  name: 'Cloudbeds' },
  { id: 4,   name: 'Mews' },
  { id: 127, name: 'RoomRaccoon' },
  { id: 96,  name: 'SabeeApp' },
  // Batch 2 — priority order
  { id: 48,  name: 'AxisRooms' },
  { id: 30,  name: 'STAAH' },
  { id: 169, name: 'STAAH V2' },
  { id: 26,  name: 'Vertical Booking' },
  { id: 36,  name: 'RateGain' },
  { id: 20,  name: 'D-EDGE' },
  // Batch 3
  { id: 24,  name: 'Channex' },
  { id: 103, name: 'StayFlexi' },
  { id: 14,  name: 'RoomCloud' },
  { id: 99,  name: 'SynXis CCX' },
  { id: 69,  name: 'DJUBO' },
  // Batch 4
  { id: 39,  name: 'HotelRunner' },
  { id: 23,  name: 'RateTiger by eRevMax' },
  { id: 102, name: 'AsiaTech' },
  { id: 110, name: 'ElektraWeb' },
  { id: 63,  name: 'ResAvenue' },
  // Batch 5
  { id: 166, name: 'Extranetsync' },
  { id: 16,  name: 'YieldPlanet' },
  { id: 101, name: 'eGlobe' },
  { id: 54,  name: 'BookingJini' },
  { id: 62,  name: 'WuBook' },
  // Batch 6
  { id: 11,  name: 'Dingus' },
  { id: 59,  name: 'Omnibees' },
  { id: 117, name: 'EaseRoom' },
  { id: 38,  name: 'HotelPartner' },
  { id: 35,  name: 'Reseliva' },
  // Batch 7
  { id: 57,  name: 'Hotel Link' },
  { id: 37,  name: 'Optima' },
  { id: 53,  name: 'Ermes' },
  { id: 108, name: 'Maximojo' },
  { id: 51,  name: 'Simple Booking' },
  // Batch 8
  { id: 122, name: 'Aiosell' },
  { id: 146, name: 'LobbyPMS' },
  { id: 27,  name: 'Booking Expert' },
  { id: 58,  name: 'Hotel Spider' },
  { id: 10,  name: 'Profitroom' },
  // Batch 9
  { id: 100, name: 'Phobs' },
  { id: 21,  name: 'TodoAlojamiento' },
  { id: 89,  name: 'HotelNetSolutions' },
  { id: 56,  name: 'Host PMS' },
  { id: 140, name: 'SistemOtel' },
  // Batch 10
  { id: 22,  name: 'Shiji' },
  { id: 44,  name: 'Mini Hotel' },
  { id: 65,  name: 'RMS' },
  { id: 85,  name: 'Isprava' },
  { id: 55,  name: 'eResConnect' },
  // Batch 11
  { id: 72,  name: 'Busy Rooms' },
  { id: 142, name: 'Octorate' },
  { id: 52,  name: 'Prestige' },
  { id: 34,  name: 'DIRS21' },
  { id: 50,  name: 'Passepartout' },
  // Batch 12
  { id: 64,  name: 'Hotetec' },
  { id: 93,  name: 'TeamSystem' },
  { id: 170, name: 'Zotel' },
  { id: 118, name: 'Booking Designer' },
  { id: 73,  name: 'MyGuestCare' },
  // Batch 13
  { id: 15,  name: 'Stays' },
  { id: 1,   name: 'HotelConnect' },
  { id: 91,  name: 'SHR' },
  { id: 43,  name: 'Lighthouse' },
  { id: 29,  name: 'NextPax' },
].sort((a, b) => a.name.localeCompare(b.name));

const ONBOARDING_API_URL = process.env['NEXT_PUBLIC_ONBOARDING_API_URL'] ?? 'http://localhost:3003';

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => copyViaExecCommand(text));
  } else {
    copyViaExecCommand(text);
  }
}
function copyViaExecCommand(text: string) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const day  = String(d.getDate()).padStart(2, '0');
  const mon  = MONTHS[d.getMonth()]!;
  const yr   = String(d.getFullYear()).slice(2);
  const hh   = String(d.getHours()).padStart(2, '0');
  const mm   = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${mon}-${yr} ${hh}:${mm}`;
}

const SESSION_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  in_progress: { bg: '#dbeafe', color: '#1e40af' },
  pending_ibe_review: { bg: '#fee2e2', color: '#991b1b' },
  pending_ari_source: { bg: '#fee2e2', color: '#991b1b' },
  pending_review: { bg: '#fef3c7', color: '#92400e' },
  approved: { bg: '#d1fae5', color: '#065f46' },
  abandoned: { bg: '#f3f4f6', color: '#6b7280' },
};

const HARVEST_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#f3f4f6', color: '#6b7280' },
  harvesting: { bg: '#dbeafe', color: '#1e40af' },
  complete: { bg: '#d1fae5', color: '#065f46' },
  failed: { bg: '#fee2e2', color: '#991b1b' },
};

function Badge({ label, status, map }: { label: string; status: string; map: Record<string, { bg: string; color: string }> }) {
  const style = map[status] ?? { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: style.bg, color: style.color, padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
      {label}
    </span>
  );
}

interface SearchCandidate {
  url: string;
  title: string;
  detected: boolean;
  ibeName: string | null;
  screenshotUrl: string | null;
  score: number;
}

export default function HotelOnboardingPage() {
  const router = useRouter();
  const [invitations, setInvitations] = useState<OnboardingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'invitations' | 'sessions' | 'hg_queue'>('invitations');
  const [listFilter, setListFilter] = useState('');
  const [blockedData, setBlockedData] = useState<BlockedDomain[]>([]);
  const [blacklisting, setBlacklisting] = useState<Record<number, boolean>>({});
  const [copiedPrompt, setCopiedPrompt] = useState<Record<number, boolean>>({});
  const [hgNotes, setHgNotes] = useState<Record<number, string>>({});
  const [hgAriNotes, setHgAriNotes] = useState<Record<number, string>>({});
  const [notifying, setNotifying] = useState<Record<number, boolean>>({});
  const [notifyDone, setNotifyDone] = useState<Record<number, boolean>>({});

  const [searchForm, setSearchForm] = useState({ hotelName: '', city: '', country: '' });
  const [lastSearchParams, setLastSearchParams] = useState<{ hotelName: string; city: string; country: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<{ address: string; latitude: number; longitude: number } | null>(null);
  const [searchAction, setSearchAction] = useState<'list' | 'manual' | 'hg_queue'>('list');
  const [hgQueueNotes, setHgQueueNotes] = useState('');
  const [hgQueueSubmitting, setHgQueueSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchElapsed, setSearchElapsed] = useState(0);
  const [candidates, setCandidates] = useState<SearchCandidate[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');

  const [countryInput, setCountryInput] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  const [ariInput, setAriInput] = useState('');
  const [ariOpen, setAriOpen] = useState(false);
  const ariRef = useRef<HTMLDivElement>(null);
  const [unknownPmsName, setUnknownPmsName] = useState('');

  const [visibleCount, setVisibleCount] = useState(2);

  type ResolveResult = { found: boolean; ibeName: string | null; ibeUrl: string | null; fullySupported: boolean; needsHgReview: boolean };
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const [createForm, setCreateForm] = useState({ pmsId: 0, contactEmail: '' });
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [hgQueued, setHgQueued] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const onboardingAppUrl = process.env['NEXT_PUBLIC_ONBOARDING_APP_URL'] ?? 'http://localhost:3002';

  async function load() {
    setLoading(true);
    try {
      const [invs, blocked] = await Promise.all([
        apiClient.listOnboardingInvitations(),
        apiClient.listBlockedDomains().catch(() => []),
      ]);
      setInvitations(invs);
      setBlockedData(blocked);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  function isAlreadyBlocked(url: string): boolean {
    if (!blockedData.length) return false;
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      const ccSlds = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
      const parts = hostname.split('.');
      const brandLabel = parts.length === 2 ? parts[0]
        : parts.length === 3 && ccSlds.has(parts[1]!) ? parts[0] : null;
      for (const d of blockedData) {
        switch (d.matchType) {
          case 'exact':    if (hostname === d.domain) return true; break;
          case 'subdomain': if (hostname === d.domain || hostname.endsWith('.' + d.domain)) return true; break;
          case 'brand':    if (brandLabel === d.domain) return true; break;
          case 'keyword':  if (hostname.includes(d.domain)) return true; break;
        }
      }
      return false;
    } catch { return false; }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false);
      if (ariRef.current && !ariRef.current.contains(e.target as Node)) setAriOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearchElapsed(0);
    setSearchError(null);
    setCandidates(null);
    setVisibleCount(2);
    setSearchAction('list');
    const timer = setInterval(() => setSearchElapsed(s => s + 1), 1000);
    try {
      setGeocodeResult(null);
    setLastSearchParams({ hotelName: searchForm.hotelName, city: searchForm.city, country: searchForm.country });
      const result = await apiClient.searchOnboardingHotel({
        hotelName: searchForm.hotelName,
        city: searchForm.city,
        country: searchForm.country,
      });
      setCandidates(result.candidates);
      // Geocode the hotel for address + map button (fire-and-forget, non-blocking)
      apiClient.geocodeHotel(searchForm.hotelName, searchForm.city, searchForm.country)
        .then(g => { if (g.result) setGeocodeResult(g.result); })
        .catch(() => {});
      // Fetch screenshots progressively via main API (avoids CORS issues with onboarding-api)
      result.candidates.forEach((c, i) => {
        if (c.screenshotUrl) return; // already has one (Brave path)
        fetch('/api/v1/admin/hotel-onboarding/screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: c.url }),
        })
          .then(r => r.ok ? r.json() : null)
          .then((data: { screenshotUrl: string | null } | null) => {
            if (!data?.screenshotUrl) return;
            setCandidates(prev => prev
              ? prev.map((p, j) => j === i ? { ...p, screenshotUrl: data.screenshotUrl } : p)
              : prev
            );
          })
          .catch(() => {});
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      clearInterval(timer);
      setSearching(false);
    }
  }

  async function selectCandidate(c: SearchCandidate) {
    setSelectedUrl(c.url);
    setResolveResult(null);
    setCreateError(null);
    setNewLink(null);

    if (c.detected) {
      // IBE URL already identified — skip resolve step
      setResolveResult({ found: true, ibeName: c.ibeName, ibeUrl: c.url, fullySupported: true, needsHgReview: false });
      return;
    }

    // Marketing site selected — follow booking links to find the IBE
    setResolving(true);
    try {
      const result = await apiClient.resolveOnboardingIbe(c.url);
      setResolveResult(result);
    } catch {
      setResolveResult({ found: false, ibeName: null, ibeUrl: null, fullySupported: false, needsHgReview: false });
    } finally {
      setResolving(false);
    }
  }

  async function useManualUrl() {
    if (!manualUrl.trim()) return;
    const url = manualUrl.trim();
    setSelectedUrl(url);
    setResolveResult(null);
    setCreateError(null);
    setNewLink(null);
    setResolving(true);
    try {
      const result = await apiClient.resolveOnboardingIbe(url);
      setResolveResult(result);
    } catch {
      setResolveResult({ found: false, ibeName: null, ibeUrl: null, fullySupported: false, needsHgReview: false });
    } finally {
      setResolving(false);
    }
  }

  async function handleLoadMore() {
    if (!lastSearchParams) return;
    setLoadingMore(true);
    try {
      // Refresh blocklist so newly blacklisted items are excluded
      const [result, freshBlocked] = await Promise.all([
        apiClient.searchOnboardingHotel(lastSearchParams),
        apiClient.listBlockedDomains().catch(() => blockedData),
      ]);
      setBlockedData(freshBlocked);

      // Merge with existing candidates — deduplicate by hostname, filter blocked
      setCandidates(prev => {
        const existing = prev ?? [];
        const existingHostnames = new Set(
          existing.map(c => { try { return new URL(c.url).hostname } catch { return c.url } })
        );
        const fresh = result.candidates.filter(c => {
          try {
            const h = new URL(c.url).hostname;
            if (existingHostnames.has(h)) return false;
            // Use the freshly loaded blocked list for this check
            for (const d of freshBlocked) {
              const hostname = h.toLowerCase().replace(/^www\./, '');
              const ccSlds = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
              const parts = hostname.split('.');
              const brandLabel = parts.length === 2 ? parts[0] : parts.length === 3 && ccSlds.has(parts[1]!) ? parts[0] : null;
              if (d.matchType === 'exact' && hostname === d.domain) return false;
              if (d.matchType === 'subdomain' && (hostname === d.domain || hostname.endsWith('.' + d.domain))) return false;
              if (d.matchType === 'brand' && brandLabel === d.domain) return false;
              if (d.matchType === 'keyword' && hostname.includes(d.domain)) return false;
            }
            return true;
          } catch { return false; }
        });
        // Fire screenshots for new candidates
        fresh.forEach((c, i) => {
          if (c.screenshotUrl) return;
          const idx = existing.length + i;
          fetch('/api/v1/admin/hotel-onboarding/screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: c.url }),
          })
            .then(r => r.ok ? r.json() : null)
            .then((data: { screenshotUrl: string | null } | null) => {
              if (!data?.screenshotUrl) return;
              setCandidates(p => p ? p.map((x, j) => j === idx ? { ...x, screenshotUrl: data.screenshotUrl } : x) : p);
            })
            .catch(() => {});
        });
        return [...existing, ...fresh];
      });
      setVisibleCount(v => v + 3);
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }

  function resetSearch() {
    setSelectedUrl(null);
    setResolveResult(null);
    setResolving(false);
    setNewLink(null);
    setCreateError(null);
  }

  async function handleCreate(e: React.FormEvent, hgStatus?: 'needs_setup' | 'needs_research') {
    e.preventDefault();
    if (!selectedUrl) return;
    const { isRegistered, isUnknown, cmName } = computeAriState();
    if (!createForm.contactEmail.trim().includes('@')) { setCreateError('Please enter a valid contact email.'); return; }
    setCreating(true);
    setCreateError(null);
    setNewLink(null);
    try {
      const effectiveHgStatus = hgStatus ?? (isUnknown ? 'needs_setup' as const : null);
      const inv = await apiClient.createOnboardingInvitation({
        ...(isRegistered ? { pmsId: createForm.pmsId } : { unknownPmsName: cmName || '(unknown)' }),
        contactEmail: createForm.contactEmail,
        ...(searchForm.hotelName ? { hotelName: searchForm.hotelName } : {}),
        ...(searchForm.city ? { city: searchForm.city } : {}),
        ...(searchForm.country ? { country: searchForm.country } : {}),
        ...(selectedUrl ? { websiteUrl: selectedUrl } : {}),
        ...(resolveResult?.ibeUrl ? { ibeUrl: resolveResult.ibeUrl } : {}),
        ...(resolveResult?.ibeName ? { ibePattern: resolveResult.ibeName } : {}),
        ...(effectiveHgStatus ? { hgStatus: effectiveHgStatus } : {}),
      });
      // Only show the invitation link when the invitation is ready to send to the hotel.
      // HG Queue items are not ready yet — show a confirmation instead.
      if (effectiveHgStatus) {
        setHgQueued(true);
      } else {
        setNewLink(`${onboardingAppUrl}/start/${inv.token}`);
      }
      setSearchForm({ hotelName: '', city: '', country: '' });
      setCountryInput('');
      setCandidates(null);
      setResolveResult(null);
      setSelectedUrl(null);
      setManualUrl('');
      setCreateForm({ pmsId: 0, contactEmail: '' });
      setAriInput('');
      setUnknownPmsName('');
      setHgQueued(false);
      await load();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to create invitation';
      let friendly = raw;
      try {
        const parsed = JSON.parse(raw) as Array<{ path: string[]; message: string }>;
        if (Array.isArray(parsed)) {
          friendly = parsed.map(e => {
            const field = e.path?.[0];
            if (field === 'pmsId') return 'Please select an ARI Source.';
            if (field === 'contactEmail') return 'Please enter a valid contact email.';
            return e.message;
          }).join(' ');
        }
      } catch { /* raw message is fine */ }
      setCreateError(friendly);
    } finally {
      setCreating(false);
    }
  }

  // Shared helper: is the user in the "ARI not in our list" path?
  function computeAriState() {
    const isRegistered = createForm.pmsId > 0;
    const savedCmName = unknownPmsName.trim();
    const typedAriText = ariInput.trim();
    // "Not on the list" is a UI sentinel, not a real CM name
    const ariName = typedAriText && typedAriText !== 'Not on the list' ? typedAriText : '';
    // Unknown path: either text in ARI field, or a CM name was explicitly saved
    const isUnknown = !isRegistered && (typedAriText.length > 0 || savedCmName.length > 0);
    const cmName = savedCmName || ariName;
    return { isRegistered, isUnknown, cmName };
  }

  async function handleAddToHgQueue(e: React.FormEvent) {
    e.preventDefault();
    const { isRegistered, isUnknown, cmName } = computeAriState();
    if (!createForm.contactEmail.trim() || (!isRegistered && !cmName)) return;
    setHgQueueSubmitting(true);
    try {
      await apiClient.createOnboardingInvitation({
        ...(isRegistered ? { pmsId: createForm.pmsId } : { unknownPmsName: cmName || '(unknown)' }),
        contactEmail: createForm.contactEmail,
        ...(searchForm.hotelName ? { hotelName: searchForm.hotelName } : {}),
        ...(searchForm.city ? { city: searchForm.city } : {}),
        ...(searchForm.country ? { country: searchForm.country } : {}),
        hgStatus: 'needs_research',
        ...(hgQueueNotes.trim() ? { hgNotes: hgQueueNotes.trim() } as any : {}),
      });
      setNewLink(null);
      setSearchForm({ hotelName: '', city: '', country: '' });
      setCountryInput(''); setCandidates(null); setSelectedUrl(null);
      setManualUrl(''); setCreateForm({ pmsId: 0, contactEmail: '' });
      setAriInput(''); setUnknownPmsName(''); setHgQueueNotes('');
      alert('Added to HG Queue for investigation.');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add to queue');
    } finally { setHgQueueSubmitting(false); }
  }

  async function handleRevoke(id: number) {
    if (!confirm('Revoke this invitation?')) return;
    await apiClient.revokeOnboardingInvitation(id);
    await load();
  }

  async function handleApprove(sessionId: number) {
    await apiClient.approveOnboardingSession(sessionId);
    await load();
  }

  function ctx(inv: OnboardingInvitation): string {
    const lines = [`Hotel: ${inv.hotelName ?? '—'}`];
    if (inv.websiteUrl) lines.push(
      `Website: ${inv.websiteUrl}\n  ⚠ This is likely the hotel's marketing site. The booking engine is typically reached via a "Book", "Check Availability" or similar button/search bar on that page — the system must follow those links to find the real IBE URL.`
    );
    if (inv.hgNotes)    lines.push(`IBE notes: ${inv.hgNotes}`);
    if (inv.hgAriNotes) lines.push(`ARI notes: ${inv.hgAriNotes}`);
    return lines.join('\n');
  }

  function buildIbePrompt(inv: OnboardingInvitation): string {
    const lines: string[] = [];
    lines.push(`# IBE Setup — ${inv.hotelName ?? 'Unknown Hotel'}`);
    lines.push('');
    lines.push('## Context');
    lines.push(ctx(inv));
    lines.push('');

    const knownPattern = inv.ibePattern && !inv.ibePattern.toLowerCase().includes('unknown');
    if (!inv.ibeUrl) {
      lines.push('## Task: Find the IBE');
      lines.push('No booking engine URL was detected. Visit the hotel website, follow the "Book" button, and identify their IBE system.');
      if (inv.websiteUrl) lines.push(`\nStart at: ${inv.websiteUrl}`);
      lines.push('\nOnce found:');
      lines.push('1. Check if the domain is in `packages/shared/src/utils/known-ibe-registry.ts`');
      lines.push('2. If not, add it (name, domainPattern, extractHotelId, searchTemplate, bookingTemplate, sampleUrl)');
      lines.push('3. Build a harvester in `apps/onboarding-api/src/services/harvesters/`');
      lines.push('4. Register it in `apps/onboarding-api/src/services/ibe-harvester-map.ts`');
    } else if (!knownPattern) {
      lines.push('## Task: Register & harvest unknown IBE');
      lines.push(`IBE URL: ${inv.ibeUrl}`);
      lines.push('\nThe booking engine URL was found but the system is not in our registry.');
      lines.push('\nSteps:');
      lines.push('1. Visit the URL — inspect JS files, API calls, URL structure to identify the system');
      lines.push('2. Add to `packages/shared/src/utils/known-ibe-registry.ts`:');
      lines.push('   { name, domainPattern, extractHotelId, searchTemplate, bookingTemplate, sampleUrl: \'<original investigation URL>\' }');
      lines.push('3. Create `apps/onboarding-api/src/services/harvesters/{name}-harvester.ts`');
      lines.push('   (use simplebooking-harvester.ts as reference)');
      lines.push('4. Register in `ibe-harvester-map.ts`');
      lines.push('5. Write tests: `apps/onboarding-api/src/services/__tests__/{name}-harvester.test.ts`');
    } else if (knownPattern) {
      const slug = inv.ibePattern!.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const className = inv.ibePattern!.replace(/[^a-zA-Z0-9]/g, '') + 'Harvester';
      lines.push('## Task: Build harvester for known IBE');
      lines.push(`IBE: ${inv.ibePattern}`);
      lines.push(`IBE URL: ${inv.ibeUrl}`);
      lines.push('\nThe IBE is in the registry but has no harvester yet.');
      lines.push('\nSteps:');
      lines.push(`1. Create \`apps/onboarding-api/src/services/harvesters/${slug}-harvester.ts\``);
      lines.push('   Implement IbeHarvester interface — see simplebooking-harvester.ts as reference');
      lines.push(`2. Register: add \`['${inv.ibePattern}', new ${className}()]\` to ibe-harvester-map.ts`);
      lines.push(`3. Write tests: \`apps/onboarding-api/src/services/__tests__/${slug}-harvester.test.ts\``);
    }

    lines.push('\n## Repo');
    lines.push('Working dir: `/home/nir/ibe`');
    lines.push('Test cmd: `pnpm --filter onboarding-api test -- --run`');
    return lines.join('\n');
  }

  function buildAriPrompt(inv: OnboardingInvitation): string {
    const cmName = inv.unknownPmsName ?? inv.pmsName ?? 'Unknown';
    const slug = cmName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const lines: string[] = [];
    lines.push(`# ARI Source Setup — ${inv.hotelName ?? 'Unknown Hotel'}`);
    lines.push('');
    lines.push('## Context');
    lines.push(ctx(inv));
    lines.push(`CM / PMS / CRS: ${cmName}`);
    if (inv.ibeUrl)     lines.push(`IBE URL: ${inv.ibeUrl}`);
    if (inv.ibePattern) lines.push(`IBE system: ${inv.ibePattern}`);
    lines.push('');
    lines.push('## Task: Build VendorFlow wizard');
    lines.push(`The hotel uses **${cmName}** which has no wizard flow in HyperGuest yet.`);
    lines.push('\nSteps:');
    lines.push(`1. Find the HG pmsId for ${cmName}:`);
    lines.push('   curl -H "X-Api-Key: geniegeniesecret" https://back-office.dev.hyperguest.io/api/v1/integration/pms');
    lines.push(`2. Create \`packages/onboarding-flows/src/vendors/${slug}.ts\``);
    lines.push('   Use siteminder.ts as reference (blank dataFlow)');
    lines.push('   Set: pmsId, pmsName, dataFlow, credentialsSchema, steps, getHGPropertyPayload');
    lines.push('3. Register in `packages/onboarding-flows/src/registry.ts`');
    lines.push('4. Add to PMS_OPTIONS in `apps/web/src/app/admin/hotel-onboarding/page.tsx`');
    lines.push('5. `pnpm --filter @ibe/onboarding-flows build`');
    lines.push('6. `pnpm --filter onboarding-api test -- --run` (update session.service.test.ts pmsId if needed)');
    lines.push('7. NOTE: Once ARI is live in HG, the hotel must complete a test booking to verify the end-to-end connection. This verification step is not yet part of the wizard — it is currently done manually outside the onboarding flow.');
    lines.push('\n## Repo');
    lines.push('Working dir: `/home/nir/ibe`');
    return lines.join('\n');
  }

  const inputStyle = { padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' as const };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Invitations</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Generate invitation links and monitor self-onboarding sessions.</p>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>New Invitation</h2>

        {candidates !== null && searchAction === 'hg_queue' && !selectedUrl ? (
          /* HG Queue direct form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#374151' }}>{searchForm.hotelName}</p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>{searchForm.city ? `${searchForm.city}, ` : ''}{searchForm.country}</p>
              </div>
              <button type="button" onClick={() => setSearchAction('list')}
                style={{ fontSize: '0.8rem', color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                ← Back to list
              </button>
            </div>
            {hgQueueNotes && (
              <div style={{ padding: '0.75rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px', fontSize: '0.85rem', color: '#92400e' }}>
                <strong>Notes:</strong> {hgQueueNotes}
              </div>
            )}
            <form onSubmit={handleAddToHgQueue} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* ARI Source combobox — same as Step 2 */}
                <div ref={ariRef} style={{ position: 'relative' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>ARI Source (CM / PMS / CRS) *</label>
                  <input type="text" value={ariInput}
                    onChange={e => { setAriInput(e.target.value); setCreateForm(p => ({ ...p, pmsId: 0 })); setAriOpen(true); }}
                    onFocus={() => setAriOpen(true)} placeholder="Type to search…" autoComplete="off"
                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel's Contact Email *</label>
                  <input type="email" required value={createForm.contactEmail}
                    onChange={e => setCreateForm(p => ({ ...p, contactEmail: e.target.value }))}
                    placeholder="hotel@example.com" style={{ width: '100%', ...inputStyle }} />
                </div>
              </div>
              {computeAriState().isUnknown && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px', padding: '0.75rem 1rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem', color: '#92400e' }}>CM / PMS / CRS name</label>
                  <AriSystemCombobox value={unknownPmsName} onChange={setUnknownPmsName} style={{ width: '100%' }} />
                </div>
              )}
              {(() => {
                const { isRegistered, isUnknown, cmName } = computeAriState();
                const ok = createForm.contactEmail.trim() && (isRegistered || (isUnknown && cmName));
                return (
                  <button type="submit" disabled={hgQueueSubmitting || !ok}
                    style={{ padding: '0.7rem 1.5rem', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: (hgQueueSubmitting || !ok) ? 'not-allowed' : 'pointer', opacity: (hgQueueSubmitting || !ok) ? 0.5 : 1 }}>
                    {hgQueueSubmitting ? 'Adding…' : '⚠ Queue for HG Setup'}
                  </button>
                );
              })()}
            </form>
          </div>
        ) : !selectedUrl ? (
          <>
            {/* Step 1: search */}
            {(() => {
              const filteredCountries = COUNTRIES.filter(c =>
                c.name.toLowerCase().includes(countryInput.toLowerCase())
              );
              const canSearch = !searching && !!searchForm.hotelName.trim() && !!searchForm.country;
              return (
                <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel Name *</label>
                    <input type="text" required value={searchForm.hotelName}
                      onChange={e => setSearchForm(p => ({ ...p, hotelName: e.target.value }))}
                      placeholder="e.g. Grand Hotel Roma"
                      style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div ref={countryRef} style={{ position: 'relative' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Country *</label>
                    <input
                      type="text"
                      value={countryInput}
                      onChange={e => {
                        setCountryInput(e.target.value);
                        setSearchForm(p => ({ ...p, country: '' }));
                        setCountryOpen(true);
                      }}
                      onFocus={() => setCountryOpen(true)}
                      placeholder="Type to search…"
                      autoComplete="off"
                      style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                    />
                    {countryOpen && filteredCountries.length > 0 && (
                      <ul style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                        margin: '2px 0 0', padding: 0, listStyle: 'none',
                        maxHeight: '220px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      }}>
                        {filteredCountries.map(c => (
                          <li key={c.code}
                            onMouseDown={() => {
                              setCountryInput(c.name);
                              setSearchForm(p => ({ ...p, country: c.name }));
                              setCountryOpen(false);
                            }}
                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{countryFlag(c.code)}</span>
                            <span>{c.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>
                      City <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.8rem' }}>(optional)</span>
                    </label>
                    <input type="text" value={searchForm.city}
                      onChange={e => setSearchForm(p => ({ ...p, city: e.target.value }))}
                      placeholder="e.g. Rome"
                      style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <button type="submit" disabled={!canSearch}
                    style={{ padding: '0.6rem 1.2rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: canSearch ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: canSearch ? 1 : 0.7 }}>
                    {searching ? `Searching… ${searchElapsed}s` : 'Search'}
                  </button>
                </form>
              );
            })()}

            {searching && (
              <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                Be patient — search can take up to 20 seconds (AI lookup + screenshot).
              </p>
            )}
            {searchError && <p style={{ color: '#dc2626', marginBottom: '1rem', fontSize: '0.875rem' }}>{searchError}</p>}

            {candidates !== null && (
              <div style={{ marginBottom: '1rem' }}>
                {/* 3 action choices */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0' }}>
                  {([
                    { key: 'list' as const,     label: `Pick from list${candidates.length ? ` (${candidates.length})` : ''}` },
                    { key: 'manual' as const,   label: 'Add manually' },
                    { key: 'hg_queue' as const, label: 'Add to HG Queue' },
                  ]).map(tab => (
                    <button key={tab.key} type="button" onClick={() => setSearchAction(tab.key)}
                      style={{
                        padding: '0.6rem 1rem', background: 'transparent', border: 'none', fontWeight: searchAction === tab.key ? 700 : 500,
                        borderBottom: searchAction === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                        color: searchAction === tab.key ? '#2563eb' : '#6b7280',
                        fontSize: '0.875rem', cursor: 'pointer', marginBottom: '-1px',
                      }}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {searchAction === 'list' && candidates.length === 0 && (
                  <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No results found. Try adding manually or sending to HG Queue.</p>
                )}
                {searchAction === 'list' && candidates.length > 0 && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                      {candidates.slice(0, visibleCount).map((c, i) => {
                        const imgSrc = c.screenshotUrl
                          ? (c.screenshotUrl.startsWith('/api/') ? c.screenshotUrl : `${ONBOARDING_API_URL}${c.screenshotUrl}`)
                          : null;
                        let hostname = c.url;
                        try { hostname = new URL(c.url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }

                        return (
                          <div key={i} style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', background: '#fff', minHeight: '180px' }}>
                            {/* Screenshot */}
                            <div style={{ width: '280px', flexShrink: 0, background: '#f3f4f6' }}>
                              {imgSrc ? (
                                <img src={imgSrc} alt={c.title}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                  onError={e => { (e.target as HTMLImageElement).parentElement!.style.background = '#f3f4f6'; (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Loading preview…</span>
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem', minWidth: 0 }}>
                              <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.95rem', color: '#1d4ed8', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {hostname}
                              </p>
                              <p style={{ margin: 0, fontSize: '1rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.title}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{
                                  background: c.score >= 70 ? '#dbeafe' : c.score >= 40 ? '#fef9c3' : '#f3f4f6',
                                  color: c.score >= 70 ? '#1d4ed8' : c.score >= 40 ? '#92400e' : '#6b7280',
                                  fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '4px',
                                }}>{c.score}% match</span>
                                {geocodeResult && (
                                  <a
                                    href={`https://www.google.com/maps?q=${geocodeResult.latitude},${geocodeResult.longitude}`}
                                    target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                                    📍 Map
                                  </a>
                                )}
                              </div>
                              {geocodeResult && (
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>
                                  {geocodeResult.address}
                                </p>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.1rem' }}>
                                {c.detected ? (
                                  <>
                                    <span style={{ fontSize: '1.1rem', color: '#16a34a', fontWeight: 700, lineHeight: 1 }}>✓</span>
                                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#15803d' }}>
                                      Booking engine detected{c.ibeName ? `: ${c.ibeName}` : ''}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ fontSize: '1.1rem', color: '#dc2626', fontWeight: 700, lineHeight: 1 }}>✕</span>
                                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#b91c1c' }}>
                                      Booking engine not detected
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.75rem', padding: '1.25rem 1.5rem', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => selectCandidate(c)}
                                style={{ padding: '0.65rem 1.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                Select
                              </button>
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'block', padding: '0.6rem 1.75rem', border: '1px solid #d1d5db', borderRadius: '7px', fontWeight: 600, fontSize: '0.9rem', color: '#374151', textDecoration: 'none', textAlign: 'center', whiteSpace: 'nowrap', background: '#fff' }}>
                                View ↗
                              </a>
                              {isAlreadyBlocked(c.url) ? (
                                <span style={{ padding: '0.55rem 1rem', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '0.78rem', color: '#9ca3af', background: '#f9fafb', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  ✓ Blocked
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={blacklisting[i]}
                                  onClick={async () => {
                                    if (!confirm(`Block "${hostname}" from future searches?\nThis removes it across all searches.`)) return;
                                    setBlacklisting(p => ({ ...p, [i]: true }));
                                    try {
                                      await apiClient.addBlockedDomain({ url: c.url, label: c.title });
                                      setCandidates(prev => prev ? prev.filter((_, j) => j !== i) : prev);
                                      const updated = await apiClient.listBlockedDomains().catch(() => []);
                                      setBlockedData(updated);
                                    } catch { /* ignore */ }
                                    finally { setBlacklisting(p => ({ ...p, [i]: false })); }
                                  }}
                                  style={{ padding: '0.55rem 1.75rem', border: '1px solid #fca5a5', borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', color: '#dc2626', background: '#fff', cursor: blacklisting[i] ? 'not-allowed' : 'pointer', opacity: blacklisting[i] ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                                  {blacklisting[i] ? '…' : 'Blacklist'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {visibleCount < candidates.length && (
                      <button
                        type="button"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        style={{ marginTop: '0.875rem', width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px', background: loadingMore ? '#f3f4f6' : '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.875rem', cursor: loadingMore ? 'not-allowed' : 'pointer', opacity: loadingMore ? 0.7 : 1 }}>
                        {loadingMore ? 'Searching for more results…' : `Load more (${candidates.length - visibleCount} already found — search may return additional results)`}
                      </button>
                    )}
                  </>
                )}

                {/* Add manually */}
                {searchAction === 'manual' && (
                  <div>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                      Paste the hotel&apos;s official website or booking engine URL directly.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="url" value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                        placeholder="https://www.hotelname.com"
                        style={{ flex: 1, ...inputStyle, fontSize: '0.875rem' }} />
                      <button type="button" onClick={useManualUrl} disabled={!manualUrl.trim()}
                        style={{ padding: '0.6rem 1.2rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: manualUrl.trim() ? 'pointer' : 'not-allowed', fontSize: '0.875rem', opacity: manualUrl.trim() ? 1 : 0.5, whiteSpace: 'nowrap' }}>
                        Use this URL
                      </button>
                    </div>
                  </div>
                )}

                {/* Add to HG Queue */}
                {searchAction === 'hg_queue' && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem 1.25rem' }}>
                    <p style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.75rem', fontWeight: 600 }}>
                      Flag this hotel for the HG team to investigate — no URL needed.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <textarea rows={2} value={hgQueueNotes} onChange={e => setHgQueueNotes(e.target.value)}
                        placeholder="Notes for HG team — what needs investigating? (optional)"
                        style={{ ...inputStyle, fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit' }} />
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#92400e' }}>
                        You still need to select the ARI Source and provide a contact email below.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Step 2: resolve IBE + complete invitation */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Selected site row */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', margin: '0 0 0.2rem' }}>HOTEL WEBSITE</p>
                <p style={{ fontSize: '0.875rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, fontFamily: 'monospace' }}>{selectedUrl}</p>
              </div>
              <button type="button" onClick={resetSearch}
                style={{ flexShrink: 0, fontSize: '0.8rem', color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                ✕ Change
              </button>
            </div>

            {/* IBE resolution status */}
            {resolving && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <span style={{ fontSize: '1.2rem', animation: 'spin 1s linear infinite' }}>⏳</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>Checking for booking engine…</p>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>Opening the hotel site and following booking links. This can take up to 30 seconds.</p>
                </div>
              </div>
            )}

            {!resolving && resolveResult && (
              resolveResult.found ? (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem 1.25rem',
                  background: resolveResult.fullySupported ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${resolveResult.fullySupported ? '#bbf7d0' : '#fde68a'}`,
                  borderRadius: '8px',
                }}>
                  <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>{resolveResult.fullySupported ? '✅' : '⚠️'}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: resolveResult.fullySupported ? '#15803d' : '#92400e' }}>
                      {resolveResult.fullySupported
                        ? `Booking engine found: ${resolveResult.ibeName}`
                        : `Booking engine found: ${resolveResult.ibeName ?? 'unknown system'}`}
                    </p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {resolveResult.ibeUrl}
                    </p>
                    {resolveResult.needsHgReview && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#92400e' }}>
                        This IBE is not yet fully supported — the invitation will be flagged for the HG team to configure manually.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem 1.25rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>🔍</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#374151' }}>No booking engine found automatically</p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                      The booking engine could not be detected on this site. Please paste the direct booking URL below, or proceed anyway and the HG team will complete the setup.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
                      <input type="url" value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                        placeholder="Paste booking engine URL…"
                        style={{ flex: 1, ...inputStyle, fontSize: '0.875rem' }} />
                      <button type="button" onClick={useManualUrl} disabled={!manualUrl.trim() || resolving}
                        style={{ padding: '0.6rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'transparent', cursor: (manualUrl.trim() && !resolving) ? 'pointer' : 'not-allowed', fontSize: '0.875rem', opacity: (manualUrl.trim() && !resolving) ? 1 : 0.5, whiteSpace: 'nowrap' }}>
                        Use this URL
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Create form — shown once resolve is done */}
            {!resolving && resolveResult && (
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div ref={ariRef} style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>ARI Source (CM / PMS / CRS) *</label>
                      {ariInput && !PMS_OPTIONS.some(o => o.name === ariInput) && (
                        <button type="button" onClick={() => { setAriInput(''); setCreateForm(p => ({ ...p, pmsId: 0 })); setUnknownPmsName(''); }}
                          style={{ fontSize: '0.75rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                          ✕ Clear
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={ariInput}
                      onChange={e => {
                        setAriInput(e.target.value);
                        setCreateForm(p => ({ ...p, pmsId: 0 }));
                        setAriOpen(true);
                      }}
                      onFocus={() => setAriOpen(true)}
                      placeholder="Type to search…"
                      autoComplete="off"
                      style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                    />
                    {ariOpen && (
                      <ul style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                        margin: '2px 0 0', padding: 0, listStyle: 'none',
                        maxHeight: '220px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      }}>
                        {PMS_OPTIONS.filter(o => o.name.toLowerCase().includes(ariInput.toLowerCase())).map(o => (
                          <li key={o.id}
                            onMouseDown={() => {
                              setAriInput(o.name);
                              setCreateForm(p => ({ ...p, pmsId: o.id }));
                              setUnknownPmsName('');
                              setAriOpen(false);
                            }}
                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >{o.name}</li>
                        ))}
                        {'not on the list'.includes(ariInput.toLowerCase()) || ariInput === '' ? (
                          <li
                            onMouseDown={() => {
                              setAriInput('Not on the list');
                              setCreateForm(p => ({ ...p, pmsId: 0 }));
                              setAriOpen(false);
                            }}
                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderTop: '1px solid #e5e7eb', color: '#92400e', fontStyle: 'italic' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#fef9c3')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >Not on the list — flag for HG team</li>
                        ) : null}
                        {PMS_OPTIONS.filter(o => o.name.toLowerCase().includes(ariInput.toLowerCase())).length === 0
                          && !'not on the list'.includes(ariInput.toLowerCase()) && (
                          <li style={{ padding: '0.5rem 0.75rem', color: '#9ca3af', fontSize: '0.875rem' }}>No match</li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel's Contact Email *</label>
                    <input type="email" required value={createForm.contactEmail}
                      onChange={e => setCreateForm(p => ({ ...p, contactEmail: e.target.value }))}
                      placeholder="hotel@example.com"
                      style={{ width: '100%', ...inputStyle }} />
                  </div>
                </div>
                {computeAriState().isUnknown && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px', padding: '0.75rem 1rem' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem', color: '#92400e' }}>
                      What is the name of the CM / PMS / CRS?
                    </label>
                    <AriSystemCombobox
                      value={unknownPmsName}
                      onChange={setUnknownPmsName}
                      style={{ width: '100%' }}
                    />
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#92400e' }}>
                      This invitation will be added to the HG team queue for manual setup.
                    </p>
                  </div>
                )}
                {createError && <p style={{ color: '#dc2626', margin: 0, fontSize: '0.875rem' }}>{createError}</p>}
                {(() => {
                  const { isRegistered, isUnknown: isUnknownPms, cmName: effectiveCmName } = computeAriState();
                  const formValid = (isRegistered || (isUnknownPms && effectiveCmName.length > 0)) && createForm.contactEmail.trim().includes('@');
                  const btnDisabled = creating || !formValid;
                  const missingHint = !formValid && !creating
                    ? (!isRegistered && !isUnknownPms ? 'Select an ARI Source' : isUnknownPms && !effectiveCmName ? 'Enter the CM name' : 'Enter a valid contact email')
                    : null;
                  return (
                    <>
                      {missingHint && <p style={{ color: '#92400e', fontSize: '0.8rem', margin: 0 }}>⚠ {missingHint} to continue.</p>}
                      {resolveResult?.fullySupported && !isUnknownPms && (
                        <button type="submit" disabled={btnDisabled}
                          style={{ padding: '0.7rem 1.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: btnDisabled ? 'not-allowed' : 'pointer', opacity: btnDisabled ? 0.5 : 1 }}>
                          {creating ? 'Creating…' : '✓ Generate Invitation Link'}
                        </button>
                      )}
                      {(resolveResult?.needsHgReview || isUnknownPms || (resolveResult && !resolveResult.found)) && (
                        <button type="button" disabled={btnDisabled}
                          onClick={e => {
                            // System picks hgStatus: needs_research if no IBE found, needs_setup otherwise
                            const status = (resolveResult && !resolveResult.found) ? 'needs_research' : 'needs_setup';
                            handleCreate(e as unknown as React.FormEvent, status);
                          }}
                          style={{ padding: '0.7rem 1.5rem', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: btnDisabled ? 'not-allowed' : 'pointer', opacity: btnDisabled ? 0.5 : 1 }}>
                          {creating ? 'Saving…' : '⚠ Queue for HG Setup'}
                        </button>
                      )}
                    </>
                  );
                })()}
              </form>
            )}
          </div>
        )}

        {newLink && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
            <p style={{ fontWeight: 600, color: '#15803d', marginBottom: '0.25rem' }}>Invitation link ready — send to the hotel:</p>
            <code style={{ wordBreak: 'break-all', fontSize: '0.875rem', color: '#166534' }}>{newLink}</code>
            <button onClick={() => copyToClipboard(newLink)}
              style={{ marginLeft: '1rem', padding: '0.25rem 0.75rem', border: '1px solid #16a34a', borderRadius: '4px', background: 'transparent', color: '#16a34a', cursor: 'pointer', fontSize: '0.8rem' }}>
              Copy
            </button>
          </div>
        )}
        {hgQueued && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠</span>
            <div>
              <p style={{ fontWeight: 600, color: '#92400e', margin: 0 }}>Added to HG Queue</p>
              <p style={{ color: '#92400e', margin: '0.15rem 0 0', fontSize: '0.82rem' }}>
                The HG team will investigate and complete the setup. No link has been sent to the hotel yet.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Invitations & Sessions — tabbed */}
      {(() => {
        const q = listFilter.toLowerCase();
        const match = (inv: OnboardingInvitation) =>
          !q ||
          (inv.hotelName ?? '').toLowerCase().includes(q) ||
          (inv.contactEmail ?? '').toLowerCase().includes(q) ||
          (inv.ibeUrl ?? '').toLowerCase().includes(q) ||
          (inv.ibePattern ?? '').toLowerCase().includes(q) ||
          (inv.pmsName ?? '').toLowerCase().includes(q) ||
          (inv.unknownPmsName ?? '').toLowerCase().includes(q);

        const tabInvitations = invitations.filter(i => !i.hgStatus && !i.session).filter(match);
        const tabSessions    = invitations.filter(i => !i.hgStatus && !!i.session).filter(match);
        const tabHgQueue     = invitations.filter(i => !!i.hgStatus).filter(match);

        const TAB_DEFS = [
          { key: 'invitations', label: 'Invitations', count: tabInvitations.length },
          { key: 'sessions',    label: 'Active Sessions', count: tabSessions.length },
          { key: 'hg_queue',   label: 'HG Queue', count: tabHgQueue.length },
        ] as const;

        const rows = activeTab === 'invitations' ? tabInvitations
                   : activeTab === 'sessions'    ? tabSessions
                   : tabHgQueue;

        return (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            {/* Header: tabs + search */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', borderBottom: '1px solid #e5e7eb', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {TAB_DEFS.map(t => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    style={{
                      padding: '0.85rem 1rem', background: 'transparent', border: 'none',
                      borderBottom: activeTab === t.key ? '2px solid #2563eb' : '2px solid transparent',
                      color: activeTab === t.key ? '#2563eb' : '#6b7280',
                      fontWeight: activeTab === t.key ? 700 : 500, fontSize: '0.875rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}>
                    {t.label}
                    <span style={{
                      background: activeTab === t.key ? '#dbeafe' : '#f3f4f6',
                      color: activeTab === t.key ? '#1d4ed8' : '#6b7280',
                      borderRadius: '9999px', padding: '0 6px', fontSize: '0.72rem', fontWeight: 700,
                    }}>{t.count}</span>
                  </button>
                ))}
              </div>
              <input
                type="text" value={listFilter} onChange={e => setListFilter(e.target.value)}
                placeholder="Filter by hotel, email, IBE…"
                style={{ padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem', width: '220px' }}
              />
            </div>

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                {listFilter ? 'No results match your filter.' : activeTab === 'hg_queue' ? 'No items in the HG queue.' : 'Nothing here yet.'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {activeTab === 'hg_queue'
                      ? ['Hotel', 'Contact Email', 'IBE', 'ARI Source', 'Source', 'Queued', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))
                      : ['Hotel', 'Contact Email', 'IBE', 'ARI Source', 'Source', activeTab === 'sessions' ? 'Session' : 'Harvest', 'Expires', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))
                    }
                  </tr>
                </thead>
                <tbody>
                  {rows.map(inv => (
                    <tr key={inv.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 500 }}>{inv.hotelName || '—'}</div>
                        {(inv.city || inv.country) && (
                          <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>
                            {[inv.city, inv.country].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#374151' }}>
                        {inv.contactEmail || <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>

                      {activeTab === 'hg_queue' ? (
                        <td style={{ padding: '0.75rem 1rem', minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#374151', wordBreak: 'break-all' }}>
                              {inv.ibePattern ?? (inv.ibeUrl ? (() => { try { return new URL(inv.ibeUrl!).hostname } catch { return inv.ibeUrl } })() : '—')}
                            </span>
                            {inv.ibeUrl && (
                              <a href={inv.ibeUrl} target="_blank" rel="noopener noreferrer"
                                style={{ flexShrink: 0, padding: '1px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.7rem', color: '#374151', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                View ↗
                              </a>
                            )}
                          </div>
                          {(() => {
                            const missingIbe = !inv.ibeUrl && !inv.ibePattern;
                            const ibeLabel = missingIbe
                              ? (inv.hgStatus === 'needs_research' ? 'Needs IBE research' : 'IBE unknown')
                              : (inv.hgStatus === 'needs_research' ? 'Needs IBE research' : 'Needs setup');
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.2rem' }}>
                                <span style={{ background: '#fef9c3', color: '#92400e', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                  {ibeLabel}
                                </span>
                                {inv.websiteUrl && !inv.ibeUrl && (
                                  <span style={{ fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic' }}>
                                    Marketing site — IBE is behind a Book / Check Availability button
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <textarea
                            rows={2}
                            value={hgNotes[inv.id] ?? inv.hgNotes ?? ''}
                            onChange={e => setHgNotes(p => ({ ...p, [inv.id]: e.target.value }))}
                            onBlur={async () => {
                              const note = hgNotes[inv.id];
                              if (note !== undefined && note !== inv.hgNotes) {
                                await apiClient.saveOnboardingNotes(inv.id, note).catch(() => {});
                              }
                            }}
                            placeholder="Investigation notes (saved automatically on blur)…"
                            style={{ display: 'block', width: '100%', marginTop: '0.5rem', padding: '0.35rem 0.5rem', fontSize: '0.78rem', border: '1px solid #d1d5db', borderRadius: '5px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4, boxSizing: 'border-box' }}
                          />
                        </td>
                      ) : (
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#6b7280', fontFamily: 'monospace' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ wordBreak: 'break-all' }}>
                              {inv.ibePattern ?? (inv.ibeUrl ? (() => { try { return new URL(inv.ibeUrl!).hostname } catch { return inv.ibeUrl } })() : '—')}
                            </span>
                            {inv.ibeUrl && (
                              <a href={inv.ibeUrl} target="_blank" rel="noopener noreferrer"
                                style={{ flexShrink: 0, padding: '1px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.7rem', color: '#374151', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                View ↗
                              </a>
                            )}
                          </div>
                        </td>
                      )}

                      <td style={{ padding: '0.75rem 1rem' }}>
                        {inv.pmsName ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.875rem' }}>{inv.pmsName}</span>
                            {activeTab === 'hg_queue' && (
                              <span style={{ background: '#d1fae5', color: '#065f46', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                Registered CM
                              </span>
                            )}
                          </div>
                        ) : inv.unknownPmsName ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.875rem', color: '#374151' }}>{inv.unknownPmsName}</span>
                            <span style={{ background: '#fef9c3', color: '#92400e', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                              Needs setup — no wizard flow yet
                            </span>
                            {activeTab === 'hg_queue' && (
                              <span style={{ fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic' }}>
                                Build a VendorFlow for this CM or verify the HG pmsId
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ color: '#9ca3af' }}>—</span>
                            {activeTab === 'hg_queue' && (
                              <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                ARI source unknown
                              </span>
                            )}
                            {activeTab === 'hg_queue' && (
                              <span style={{ fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic' }}>
                                Hotel needs to specify their CM before onboarding can proceed
                              </span>
                            )}
                          </div>
                        )}
                        {activeTab === 'hg_queue' && (
                          <textarea
                            rows={2}
                            value={hgAriNotes[inv.id] ?? inv.hgAriNotes ?? ''}
                            onChange={e => setHgAriNotes(p => ({ ...p, [inv.id]: e.target.value }))}
                            onBlur={async () => {
                              const note = hgAriNotes[inv.id];
                              if (note !== undefined && note !== inv.hgAriNotes) {
                                await apiClient.saveOnboardingAriNotes(inv.id, note).catch(() => {});
                              }
                            }}
                            placeholder="ARI investigation notes…"
                            style={{ display: 'block', width: '100%', marginTop: '0.4rem', padding: '0.35rem 0.5rem', fontSize: '0.78rem', border: '1px solid #d1d5db', borderRadius: '5px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4, boxSizing: 'border-box' as const }}
                          />
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        {(() => {
                          const src = inv.source;
                          const label = src === 'self_registration' ? 'Hotel Self' : src === 'zoho' ? 'CRM' : 'HG Agent';
                          const bg   = src === 'self_registration' ? '#dbeafe' : src === 'zoho' ? '#fef3c7' : '#f3f4f6';
                          const color= src === 'self_registration' ? '#1e40af' : src === 'zoho' ? '#92400e' : '#374151';
                          return <span style={{ background: bg, color, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{label}</span>;
                        })()}
                      </td>

                      {activeTab === 'sessions' ? (
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {inv.session
                            ? <Badge label={inv.session.status} status={inv.session.status} map={SESSION_STATUS_COLORS} />
                            : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                      ) : activeTab === 'hg_queue' ? (
                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.8rem' }}>
                          {fmtDate(inv.createdAt)}
                        </td>
                      ) : (
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Badge label={inv.harvestStatus} status={inv.harvestStatus} map={HARVEST_STATUS_COLORS} />
                        </td>
                      )}

                      {activeTab !== 'hg_queue' && (
                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.8rem' }}>
                          {fmtDate(inv.expiresAt)}
                        </td>
                      )}

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {!inv.usedAt && !inv.revokedAt && !inv.hgStatus && (
                            <>
                              <button onClick={() => copyToClipboard(`${onboardingAppUrl}/start/${inv.token}`)}
                                style={{ padding: '0.25rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent' }}>
                                Copy Link
                              </button>
                              <button onClick={() => handleRevoke(inv.id)}
                                style={{ padding: '0.25rem 0.6rem', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#dc2626' }}>
                                Revoke
                              </button>
                            </>
                          )}
                          {inv.session?.status === 'pending_review' && (
                            <button onClick={() => handleApprove(inv.session!.id)}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #16a34a', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#16a34a' }}>
                              Approve
                            </button>
                          )}
                          {inv.hgStatus && !inv.revokedAt && (
                            <button onClick={() => handleRevoke(inv.id)}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#dc2626' }}>
                              Dismiss
                            </button>
                          )}
                          {inv.hgStatus && (inv.ibeUrl !== undefined || !inv.ibePattern) && (
                            <button
                              onClick={() => {
                                copyToClipboard(buildIbePrompt(inv));
                                setCopiedPrompt(p => ({ ...p, [inv.id * 10]: true }));
                                setTimeout(() => setCopiedPrompt(p => ({ ...p, [inv.id * 10]: false })), 2000);
                              }}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #6366f1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: copiedPrompt[inv.id * 10] ? '#6366f1' : 'transparent', color: copiedPrompt[inv.id * 10] ? '#fff' : '#6366f1', whiteSpace: 'nowrap' }}>
                              {copiedPrompt[inv.id * 10] ? '✓' : '⚡'} IBE Prompt
                            </button>
                          )}
                          {inv.hgStatus && (!inv.pmsId || inv.unknownPmsName) && (
                            <button
                              onClick={() => {
                                copyToClipboard(buildAriPrompt(inv));
                                setCopiedPrompt(p => ({ ...p, [inv.id * 10 + 1]: true }));
                                setTimeout(() => setCopiedPrompt(p => ({ ...p, [inv.id * 10 + 1]: false })), 2000);
                              }}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #0891b2', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: copiedPrompt[inv.id * 10 + 1] ? '#0891b2' : 'transparent', color: copiedPrompt[inv.id * 10 + 1] ? '#fff' : '#0891b2', whiteSpace: 'nowrap' }}>
                              {copiedPrompt[inv.id * 10 + 1] ? '✓' : '⚡'} ARI Prompt
                            </button>
                          )}
                          {inv.hgStatus && !inv.revokedAt && (() => {
                            const note = hgNotes[inv.id] ?? inv.hgNotes ?? '';
                            const done = notifyDone[inv.id];
                            const busy = notifying[inv.id];
                            return (
                              <button
                                disabled={busy || done}
                                onClick={async () => {
                                  setNotifying(p => ({ ...p, [inv.id]: true }));
                                  try {
                                    const ibePr = (inv.ibeUrl !== undefined || !inv.ibePattern) ? buildIbePrompt(inv) : undefined;
                                    const ariPr = (!inv.pmsId || inv.unknownPmsName) ? buildAriPrompt(inv) : undefined;
                                    await apiClient.notifyDevTeam(inv.id, note, ibePr, ariPr);
                                    setNotifyDone(p => ({ ...p, [inv.id]: true }));
                                  } catch { /* ignore */ }
                                  finally { setNotifying(p => ({ ...p, [inv.id]: false })); }
                                }}
                                style={{ padding: '0.25rem 0.6rem', border: '1px solid #6366f1', borderRadius: '4px', cursor: (busy || done) ? 'default' : 'pointer', fontSize: '0.78rem', background: done ? '#6366f1' : 'transparent', color: done ? '#fff' : '#6366f1', opacity: busy ? 0.6 : 1 }}>
                                {done ? '✓ Notified' : busy ? 'Sending…' : '🔔 Notify Dev'}
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}
    </div>
  );
}
