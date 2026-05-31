'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient, type OnboardingInvitation, type BlockedDomain } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { AriSourceCombobox } from '@/components/onboarding/AriSourceCombobox';
import type { AriSelection } from '@ibe/shared';
import { COUNTRIES, countryFlag } from '@/lib/countries';


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
  pending:    { bg: '#f3f4f6', color: '#6b7280' },
  queued:     { bg: '#fef3c7', color: '#92400e' },
  harvesting: { bg: '#dbeafe', color: '#1e40af' },
  complete:   { bg: '#d1fae5', color: '#065f46' },
  failed:     { bg: '#fee2e2', color: '#991b1b' },
};

function Row({ label, value }: { label: string; value: string }) {
  return <div><span style={{ color: '#6b7280', fontWeight: 600 }}>{label}: </span><span style={{ color: '#374151' }}>{value}</span></div>;
}

function Badge({ label, status, map }: { label: string; status: string; map: Record<string, { bg: string; color: string }> }) {
  const style = map[status] ?? { bg: '#f3f4f6', color: '#6b7280' };
  const isHarvesting = status === 'harvesting';
  return (
    <>
      {isHarvesting && (
        <style>{`
          @keyframes ibe-pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
          @keyframes ibe-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        `}</style>
      )}
      <span style={{
        background: style.bg, color: style.color,
        padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        animation: isHarvesting ? 'ibe-pulse 1.4s ease-in-out infinite' : undefined,
      }}>
        {isHarvesting && (
          <span style={{ display: 'inline-block', animation: 'ibe-spin 1.8s linear infinite', lineHeight: 1 }}>⏳</span>
        )}
        {label}
      </span>
    </>
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
  const [showDeleted, setShowDeleted] = useState(false);
  const [supportedIbes, setSupportedIbes] = useState<string[]>([]);
  const [expandedActions, setExpandedActions] = useState<Record<number, boolean>>({});
  const [commentModal, setCommentModal] = useState<{ invId: number; type: 'ibe' | 'ari'; value: string } | null>(null);
  const [harvestModal, setHarvestModal] = useState<OnboardingInvitation | null>(null);
  const [harvestElapsed, setHarvestElapsed] = useState(0);
  const [harvestLiveLog, setHarvestLiveLog] = useState<string | null>(null);
  const [harvestExpanded, setHarvestExpanded] = useState<string | null>(null);
  const [harvestDetailPopup, setHarvestDetailPopup] = useState<{ section: string; data: Record<string, unknown> } | null>(null);
  const [harvestDetailTab, setHarvestDetailTab] = useState('status-ibe');
  const [ddCookie, setDdCookie] = useState('');
  const [ddSaved, setDdSaved] = useState(false);
  const [roomImgPopup, setRoomImgPopup] = useState<{ name: string; images: string[] } | null>(null);
  const [scrapeTabOpen, setScrapeTabOpen] = useState(false);
  const [scrapeTabsInfo, setScrapeTabsInfo] = useState<{ opened: number; total: number } | null>(null);
  const [bookmarkletReady, setBookmarkletReady] = useState(() => {
    try { return localStorage.getItem('hg-bookmarklet-setup') === 'done' } catch { return false }
  });
  const scrapeTabPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bookmarkletAnchorRef = useRef<HTMLAnchorElement>(null);
  const [filterAriSource, setFilterAriSource] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterHgStaff, setFilterHgStaff] = useState('');
  const [filterHarvest, setFilterHarvest] = useState('');
  const [filterExpires, setFilterExpires] = useState('');

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

  const [ariSelection, setAriSelection] = useState<AriSelection | null>(null);

  const [visibleCount, setVisibleCount] = useState(2);

  type ResolveResult = { found: boolean; ibeName: string | null; ibeUrl: string | null; fullySupported: boolean; needsHgReview: boolean; suggestedUrl?: string | null };
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [hgQueued, setHgQueued] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const onboardingAppUrl = process.env['NEXT_PUBLIC_ONBOARDING_APP_URL'] ?? 'http://localhost:3002';

  async function load(deleted = showDeleted) {
    setLoading(true);
    try {
      const [invs, blocked, ibes] = await Promise.all([
        apiClient.listOnboardingInvitations(deleted),
        apiClient.listBlockedDomains().catch(() => []),
        apiClient.listSupportedIbes().catch(() => ({ supported: [] })),
      ]);
      setInvitations(invs);
      setBlockedData(blocked);
      setSupportedIbes(ibes.supported);
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

  // Auto-refresh every 5s when there are active harvests (queued or harvesting)
  useEffect(() => {
    const hasActive = invitations.some(i => i.harvestStatus === 'queued' || i.harvestStatus === 'harvesting');
    if (!hasActive) return;
    const id = setInterval(() => load(), 5000);
    return () => clearInterval(id);
  }, [invitations]);

  // Live elapsed timer for harvesting modal
  useEffect(() => {
    if (!harvestModal || !['harvesting', 'queued'].includes(harvestModal.harvestStatus)) return;
    const start = harvestModal.harvestStartedAt ? new Date(harvestModal.harvestStartedAt).getTime() : new Date(harvestModal.createdAt).getTime();
    setHarvestElapsed(Math.floor((Date.now() - start) / 1000));
    const id = setInterval(() => setHarvestElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [harvestModal]);

  // Poll harvest status every 2s while modal is open and in-progress
  useEffect(() => {
    if (!harvestModal || !['harvesting', 'queued'].includes(harvestModal.harvestStatus)) {
      setHarvestLiveLog(null);
      return;
    }
    setHarvestLiveLog(harvestModal.harvestLog ?? null);
    const id = setInterval(async () => {
      try {
        const status = await apiClient.getOnboardingHarvestStatus(harvestModal.id);
        setHarvestLiveLog(status.harvestLog);
        // Update the modal's status fields live so badge/progress bar reflect current state
        setHarvestModal(prev => prev ? {
          ...prev,
          harvestStatus: status.harvestStatus,
          harvestLog: status.harvestLog,
          harvestStartedAt: status.harvestStartedAt,
          harvestCompletedAt: status.harvestCompletedAt,
          failureReason: status.failureReason,
        } : null);
        // Only close on terminal states
        if (status.harvestStatus === 'complete' || status.harvestStatus === 'failed') {
          await load();
          setHarvestModal(null);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(id);
  }, [harvestModal]);

  // Keep harvest modal in sync with the invitations list after any load()
  useEffect(() => {
    if (!harvestModal) return;
    const fresh = invitations.find(i => i.id === harvestModal.id);
    if (fresh) setHarvestModal(fresh);
  }, [invitations]); // eslint-disable-line react-hooks/exhaustive-deps

  // No-op — href is now set via ref callback on mount (see anchor below)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false);
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
      // Filter out already-blocked domains up front
      const currentBlocked = blockedData;
      const filtered = result.candidates.filter(c => {
        try {
          const h = new URL(c.url).hostname.toLowerCase().replace(/^www\./, '');
          const parts = h.split('.');
          const ccSlds = new Set(['co','com','org','net','gov','edu','ac']);
          const brand = parts.length === 2 ? parts[0] : parts.length === 3 && ccSlds.has(parts[1]!) ? parts[0] : null;
          for (const d of currentBlocked) {
            if (d.matchType === 'exact' && h === d.domain) return false;
            if (d.matchType === 'subdomain' && (h === d.domain || h.endsWith('.' + d.domain))) return false;
            if (d.matchType === 'brand' && brand === d.domain) return false;
            if (d.matchType === 'keyword' && h.includes(d.domain)) return false;
          }
          return true;
        } catch { return true; }
      });
      setCandidates(filtered);
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
    setManualUrl('');

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
      if (!result.found && result.suggestedUrl) setManualUrl(result.suggestedUrl);
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
    setManualUrl('');
  }

  async function handleCreate(e: React.FormEvent, hgStatus?: 'needs_setup' | 'needs_research') {
    e.preventDefault();
    if (!selectedUrl) return;
    const { isRegistered, isUnknown, cmName, pmsId, unknownPmsStatus } = computeAriState();
    if (!contactEmail.trim().includes('@')) { setCreateError('Please enter a valid contact email.'); return; }
    setCreating(true);
    setCreateError(null);
    setNewLink(null);
    try {
      const effectiveHgStatus = hgStatus ?? (isUnknown ? 'needs_setup' as const : null);
      const inv = await apiClient.createOnboardingInvitation({
        ...(isRegistered ? { pmsId: pmsId! } : { unknownPmsName: cmName || '(unknown)', ...(unknownPmsStatus ? { unknownPmsStatus } : {}) }),
        contactEmail: contactEmail,
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
      setAriSelection(null);
      setContactEmail('');
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
    if (!ariSelection) return { isRegistered: false, isUnknown: false, cmName: '', pmsId: undefined as number | undefined, unknownPmsStatus: undefined as 'to_be_added' | 'to_be_checked' | undefined }
    if (ariSelection.kind === 'hg_has') {
      return { isRegistered: true, isUnknown: false, cmName: ariSelection.name, pmsId: ariSelection.pmsId, unknownPmsStatus: undefined as 'to_be_added' | 'to_be_checked' | undefined }
    }
    return {
      isRegistered: false,
      isUnknown: true,
      cmName: ariSelection.name,
      pmsId: undefined as number | undefined,
      unknownPmsStatus: (ariSelection.kind === 'to_be_added' ? 'to_be_added' : 'to_be_checked') as 'to_be_added' | 'to_be_checked',
    }
  }

  async function handleAddToHgQueue(e: React.FormEvent) {
    e.preventDefault();
    const { isRegistered, isUnknown, cmName, pmsId, unknownPmsStatus } = computeAriState();
    if (!contactEmail.trim() || (!isRegistered && !cmName)) return;
    setHgQueueSubmitting(true);
    try {
      await apiClient.createOnboardingInvitation({
        ...(isRegistered ? { pmsId: pmsId! } : { unknownPmsName: cmName || '(unknown)', ...(unknownPmsStatus ? { unknownPmsStatus } : {}) }),
        contactEmail: contactEmail,
        ...(searchForm.hotelName ? { hotelName: searchForm.hotelName } : {}),
        ...(searchForm.city ? { city: searchForm.city } : {}),
        ...(searchForm.country ? { country: searchForm.country } : {}),
        hgStatus: 'needs_research',
        ...(hgQueueNotes.trim() ? { hgNotes: hgQueueNotes.trim() } as any : {}),
      });
      setNewLink(null);
      setSearchForm({ hotelName: '', city: '', country: '' });
      setCountryInput(''); setCandidates(null); setSelectedUrl(null);
      setManualUrl(''); setAriSelection(null); setContactEmail(''); setHgQueueNotes('');
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

  async function handleReInvite(id: number) {
    if (!confirm('Send a fresh invitation link to this hotel?')) return;
    await apiClient.resendOnboardingInvitation(id);
    await load();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this invitation? It can be recovered by showing deleted items.')) return;
    await apiClient.softDeleteOnboardingInvitation(id);
    await load();
  }

  async function handlePermanentDelete(id: number) {
    if (!confirm('Permanently delete this invitation? This cannot be undone.')) return;
    await apiClient.deleteOnboardingInvitation(id);
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
    lines.push('4. Add to the HG VendorFlow list so it appears in the AriSourceCombobox');
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
                {/* ARI Source combobox */}
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>ARI Source (CM / PMS / CRS) *</label>
                  <AriSourceCombobox value={ariSelection} onChange={setAriSelection} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel's Contact Email *</label>
                  <input type="email" required value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="hotel@example.com" style={{ width: '100%', ...inputStyle }} />
                </div>
              </div>
              {(() => {
                const { isRegistered, isUnknown, cmName } = computeAriState();
                const ok = contactEmail.trim().includes('@') && (isRegistered || (isUnknown && cmName));
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
                Be patient — search can take up to 20 seconds.
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
                  <>
                    <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No results — all were filtered by the blacklist.</p>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button type="button" onClick={handleLoadMore} disabled={loadingMore}
                        style={{ flex: 1, padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px', background: loadingMore ? '#f3f4f6' : '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.875rem', cursor: loadingMore ? 'not-allowed' : 'pointer', opacity: loadingMore ? 0.7 : 1 }}>
                        {loadingMore ? 'Searching…' : '🔄 Try different results'}
                      </button>
                      <button type="button" disabled={loadingMore} onClick={async () => {
                        if (!lastSearchParams) return;
                        setLoadingMore(true);
                        try {
                          const result = await apiClient.searchOnboardingHotelAI(lastSearchParams);
                          if (result.candidates.length > 0) setCandidates(result.candidates);
                        } catch { /* ignore */ } finally { setLoadingMore(false); }
                      }}
                        style={{ flex: 1, padding: '0.65rem', border: '1px solid #6366f1', borderRadius: '8px', background: loadingMore ? '#f3f4f6' : '#eff6ff', color: '#4338ca', fontWeight: 600, fontSize: '0.875rem', cursor: loadingMore ? 'not-allowed' : 'pointer', opacity: loadingMore ? 0.7 : 1 }}>
                        {loadingMore ? 'Searching…' : '✨ Ask AI'}
                      </button>
                    </div>
                  </>
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
                    {!resolveResult.suggestedUrl && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#dc2626' }}>
                        ⚠ The system could not find any booking engine link on this website.
                      </p>
                    )}
                    {resolveResult.suggestedUrl && (
                      <div style={{ marginTop: '0.5rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.6rem 0.75rem' }}>
                        <div style={{ fontSize: '0.78rem', color: '#1e40af', fontWeight: 600, marginBottom: '0.3rem' }}>🔗 The system found this URL:</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <a href={resolveResult.suggestedUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '0.78rem', color: '#2563eb', wordBreak: 'break-all', flex: 1 }}>
                            {resolveResult.suggestedUrl}
                          </a>
                          <button type="button" onClick={() => { setManualUrl(resolveResult.suggestedUrl!); }}
                            style={{ flexShrink: 0, padding: '0.2rem 0.6rem', border: '1px solid #2563eb', borderRadius: '4px', background: 'transparent', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Use this URL
                          </button>
                        </div>
                      </div>
                    )}
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
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>ARI Source (CM / PMS / CRS) *</label>
                    <AriSourceCombobox value={ariSelection} onChange={setAriSelection} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.3rem', fontSize: '0.875rem' }}>Hotel's Contact Email *</label>
                    <input type="email" required value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      placeholder="hotel@example.com"
                      style={{ width: '100%', ...inputStyle }} />
                  </div>
                </div>
                {createError && <p style={{ color: '#dc2626', margin: 0, fontSize: '0.875rem' }}>{createError}</p>}
                {(() => {
                  const { isRegistered, isUnknown: isUnknownPms, cmName: effectiveCmName } = computeAriState();
                  const formValid = (isRegistered || (isUnknownPms && effectiveCmName.length > 0)) && contactEmail.trim().includes('@');
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
        const now = new Date();
        const match = (inv: OnboardingInvitation) => {
          if (q && !(
            (inv.hotelName ?? '').toLowerCase().includes(q) ||
            (inv.contactEmail ?? '').toLowerCase().includes(q) ||
            (inv.ibeUrl ?? '').toLowerCase().includes(q) ||
            (inv.ibePattern ?? '').toLowerCase().includes(q) ||
            (inv.pmsName ?? '').toLowerCase().includes(q) ||
            (inv.unknownPmsName ?? '').toLowerCase().includes(q)
          )) return false;
          if (filterAriSource && (inv.pmsName ?? inv.unknownPmsName ?? '') !== filterAriSource) return false;
          if (filterSource && inv.source !== filterSource) return false;
          if (filterHgStaff && (inv.createdByAdmin?.name ?? '') !== filterHgStaff) return false;
          if (filterHarvest && inv.harvestStatus !== filterHarvest) return false;
          if (filterExpires === 'expired' && new Date(inv.expiresAt) > now) return false;
          if (filterExpires === 'active' && new Date(inv.expiresAt) <= now) return false;
          return true;
        };

        const ariSourceOptions = [...new Set(invitations.map(i => i.pmsName ?? i.unknownPmsName ?? '').filter(Boolean))].sort();
        const hgStaffOptions   = [...new Set(invitations.map(i => i.createdByAdmin?.name ?? '').filter(Boolean))].sort();
        const harvestOptions   = [...new Set(invitations.map(i => i.harvestStatus).filter(Boolean))].sort();

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
            {/* Header: tabs */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {TAB_DEFS.map(t => (
                  <button key={t.key} onClick={() => { setActiveTab(t.key); if (t.key === 'hg_queue') { setFilterHarvest(''); setFilterExpires(''); } }}
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
            </div>

            {/* Filters bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.5rem', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexWrap: 'wrap' }}>
              <input
                type="text" value={listFilter} onChange={e => setListFilter(e.target.value)}
                placeholder="Filter by hotel, email, IBE…"
                style={{ padding: '0.3rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.78rem', width: '200px' }}
              />
              <select value={filterAriSource} onChange={e => setFilterAriSource(e.target.value)}
                style={{ padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.78rem', color: filterAriSource ? '#111' : '#9ca3af' }}>
                <option value="">ARI Source</option>
                {ariSourceOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                style={{ padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.78rem', color: filterSource ? '#111' : '#9ca3af' }}>
                <option value="">Source</option>
                <option value="staff_invite">HG Agent</option>
                <option value="self_registration">Hotel Self</option>
                <option value="zoho">CRM</option>
              </select>
              <select value={filterHgStaff} onChange={e => setFilterHgStaff(e.target.value)}
                style={{ padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.78rem', color: filterHgStaff ? '#111' : '#9ca3af' }}>
                <option value="">HG-Staff</option>
                {hgStaffOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {activeTab !== 'hg_queue' && (
                <select value={filterHarvest} onChange={e => setFilterHarvest(e.target.value)}
                  style={{ padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.78rem', color: filterHarvest ? '#111' : '#9ca3af' }}>
                  <option value="">Harvest</option>
                  {harvestOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {activeTab !== 'hg_queue' && (
                <select value={filterExpires} onChange={e => setFilterExpires(e.target.value)}
                  style={{ padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.78rem', color: filterExpires ? '#111' : '#9ca3af' }}>
                  <option value="">Expires</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                </select>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#6b7280', cursor: 'pointer', userSelect: 'none', marginLeft: '0.25rem' }}>
                <input type="checkbox" checked={showDeleted} onChange={e => {
                  setShowDeleted(e.target.checked);
                  load(e.target.checked);
                }} />
                Show deleted
              </label>
              {(filterAriSource || filterSource || filterHgStaff || filterHarvest || filterExpires || listFilter) && (
                <button onClick={() => { setFilterAriSource(''); setFilterSource(''); setFilterHgStaff(''); setFilterHarvest(''); setFilterExpires(''); setListFilter(''); }}
                  style={{ padding: '0.3rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.78rem', background: 'transparent', color: '#6b7280', cursor: 'pointer' }}>
                  Clear filters
                </button>
              )}
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
                      ? ['Hotel', 'Contact Email', 'IBE', 'ARI Source', 'Source', 'HG-Staff', 'Queued', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))
                      : ['Hotel', 'Contact Email', 'IBE', 'ARI Source', 'Source', 'HG-Staff', activeTab === 'sessions' ? 'Session' : 'Harvest', 'Expires', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))
                    }
                  </tr>
                </thead>
                <tbody>
                  {rows.map(inv => (
                    <tr key={inv.id} style={{ borderTop: '1px solid #e5e7eb', opacity: inv.deletedAt ? 0.5 : 1, background: inv.deletedAt ? '#fafafa' : undefined }}>
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
                          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                            {inv.websiteUrl && (
                              <a href={inv.websiteUrl} target="_blank" rel="noopener noreferrer"
                                style={{ padding: '1px 7px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.7rem', color: '#374151', textDecoration: 'none', whiteSpace: 'nowrap', background: '#f9fafb' }}>
                                Site ↗
                              </a>
                            )}
                            {inv.ibeUrl && (
                              <a href={inv.ibeUrl} target="_blank" rel="noopener noreferrer"
                                style={{ padding: '1px 7px', border: '1px solid #2563eb', borderRadius: '4px', fontSize: '0.7rem', color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap', background: '#eff6ff' }}>
                                IBE ↗
                              </a>
                            )}
                          </div>
                          {(() => {
                            const missingIbe = !inv.ibeUrl && !inv.ibePattern;
                            const harvesterReady = inv.ibePattern && supportedIbes.includes(inv.ibePattern);
                            const ibeLabel = missingIbe
                              ? (inv.hgStatus === 'needs_research' ? 'Needs IBE research' : 'IBE unknown')
                              : (inv.hgStatus === 'needs_research' ? 'Needs IBE research' : 'Needs setup');
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.2rem' }}>
                                {harvesterReady ? (
                                  <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                    ✅ Harvester ready — Retry Harvest
                                  </span>
                                ) : (
                                  <span style={{ background: '#fef9c3', color: '#92400e', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                    {ibeLabel}
                                  </span>
                                )}
                                {inv.websiteUrl && !inv.ibeUrl && (
                                  <span style={{ fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic' }}>
                                    Marketing site — IBE is behind a Book / Check Availability button
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {(() => {
                            const hasNote = !!(hgNotes[inv.id] ?? inv.hgNotes ?? '');
                            return (
                              <button
                                onClick={() => setCommentModal({ invId: inv.id, type: 'ibe', value: hgNotes[inv.id] ?? inv.hgNotes ?? '' })}
                                style={{ marginTop: '0.5rem', padding: '0.25rem 0.6rem', border: `1px solid ${hasNote ? '#93c5fd' : '#d1d5db'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', background: hasNote ? '#eff6ff' : 'transparent', color: hasNote ? '#1d4ed8' : '#6b7280' }}>
                                {hasNote ? '💬 Comment' : '+ Add comment'}
                              </button>
                            );
                          })()}
                        </td>
                      ) : (
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#6b7280' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                            {inv.websiteUrl && (
                              <a href={inv.websiteUrl} target="_blank" rel="noopener noreferrer"
                                style={{ padding: '1px 7px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.7rem', color: '#374151', textDecoration: 'none', whiteSpace: 'nowrap', background: '#f9fafb' }}>
                                Site ↗
                              </a>
                            )}
                            {inv.ibeUrl && (
                              <a href={inv.ibeUrl} target="_blank" rel="noopener noreferrer"
                                style={{ padding: '1px 7px', border: '1px solid #2563eb', borderRadius: '4px', fontSize: '0.7rem', color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap', background: '#eff6ff' }}>
                                IBE ↗
                              </a>
                            )}
                          </div>
                          {!inv.ibeUrl && <span style={{ color: '#9ca3af' }}>—</span>}
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
                              No flow yet
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ color: '#9ca3af' }}>—</span>
                            {activeTab === 'hg_queue' && (
                              <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                ARI source unknown
                              </span>
                            )}
                          </div>
                        )}
                        {activeTab === 'hg_queue' && (() => {
                          const hasNote = !!(hgAriNotes[inv.id] ?? inv.hgAriNotes ?? '');
                          return (
                            <button
                              onClick={() => setCommentModal({ invId: inv.id, type: 'ari', value: hgAriNotes[inv.id] ?? inv.hgAriNotes ?? '' })}
                              style={{ marginTop: '0.4rem', padding: '0.25rem 0.6rem', border: `1px solid ${hasNote ? '#93c5fd' : '#d1d5db'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', background: hasNote ? '#eff6ff' : 'transparent', color: hasNote ? '#1d4ed8' : '#6b7280', whiteSpace: 'nowrap' }}>
                              {hasNote ? '💬 Comment' : '+ Add comment'}
                            </button>
                          );
                        })()}
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

                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#374151', whiteSpace: 'nowrap' }}>
                        {inv.createdByAdmin ? inv.createdByAdmin.name : <span style={{ color: '#9ca3af' }}>—</span>}
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
                          <button onClick={() => { setHarvestDetailTab('status-ibe'); setHarvestModal(inv); load(); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                            <Badge label={inv.harvestStatus} status={inv.harvestStatus} map={HARVEST_STATUS_COLORS} />
                          </button>
                        </td>
                      )}

                      {activeTab !== 'hg_queue' && (
                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.8rem' }}>
                          {fmtDate(inv.expiresAt)}
                        </td>
                      )}

                      <td style={{ padding: '0.75rem 1rem' }}>
                        {activeTab === 'hg_queue' && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              onClick={() => setExpandedActions(p => ({ ...p, [inv.id]: !p[inv.id] }))}
                              style={{ padding: '0.25rem 0.7rem', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: expandedActions[inv.id] ? '#f3f4f6' : 'transparent', color: '#374151', whiteSpace: 'nowrap' }}>
                              Actions {expandedActions[inv.id] ? '↑' : '→'}
                            </button>
                            {expandedActions[inv.id] && (
                              <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 50, marginBottom: '4px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '140px' }}>
                                {inv.ibeUrl && (() => {
                                  const harvesterReady = inv.ibePattern && supportedIbes.includes(inv.ibePattern);
                                  const canRetry = inv.harvestStatus === 'failed' || inv.harvestStatus === 'pending' || harvesterReady;
                                  return (
                                    <>
                                      {canRetry && (
                                        <button onClick={async () => { await apiClient.retryOnboardingHarvest(inv.id); setExpandedActions(p => ({ ...p, [inv.id]: false })); await load(); }}
                                          style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: harvesterReady ? '#dcfce7' : 'transparent', color: '#16a34a', textAlign: 'left', width: '100%', fontWeight: harvesterReady ? 700 : 400 }}>
                                          🔄 {harvesterReady ? 'Harvester ready — Run now' : 'Retry Harvest'}
                                        </button>
                                      )}
                                      {inv.harvestStatus === 'complete' && (
                                        <button onClick={async () => { if (!confirm('Re-harvest from scratch?')) return; await apiClient.reharvestOnboarding(inv.id); setExpandedActions(p => ({ ...p, [inv.id]: false })); await load(); }}
                                          style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#6b7280', textAlign: 'left', width: '100%' }}>
                                          ↺ Re-harvest (from scratch)
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                                {inv.hgStatus && !inv.revokedAt && (
                                  <button onClick={() => { handleRevoke(inv.id); setExpandedActions(p => ({ ...p, [inv.id]: false })); }}
                                    style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#dc2626', textAlign: 'left', width: '100%' }}>
                                    🚫 Dismiss
                                  </button>
                                )}
                                <button
                                  onClick={() => { setHarvestDetailTab('status-ibe'); setHarvestModal(inv); setExpandedActions(p => ({ ...p, [inv.id]: false })); load(); }}
                                  style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#374151', textAlign: 'left', width: '100%' }}>
                                  📊 Harvest Details
                                </button>
                                {inv.hgStatus && (inv.ibeUrl !== undefined || !inv.ibePattern) && (
                                  <button
                                    onClick={() => { copyToClipboard(buildIbePrompt(inv)); setCopiedPrompt(p => ({ ...p, [inv.id * 10]: true })); setTimeout(() => setCopiedPrompt(p => ({ ...p, [inv.id * 10]: false })), 2000); }}
                                    style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: copiedPrompt[inv.id * 10] ? '#6366f1' : 'transparent', color: copiedPrompt[inv.id * 10] ? '#fff' : '#6366f1', textAlign: 'left', width: '100%' }}>
                                    {copiedPrompt[inv.id * 10] ? '✓' : '⚡'} IBE Prompt
                                  </button>
                                )}
                                {inv.hgStatus && (!inv.pmsId || inv.unknownPmsName) && (
                                  <button
                                    onClick={() => { copyToClipboard(buildAriPrompt(inv)); setCopiedPrompt(p => ({ ...p, [inv.id * 10 + 1]: true })); setTimeout(() => setCopiedPrompt(p => ({ ...p, [inv.id * 10 + 1]: false })), 2000); }}
                                    style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: copiedPrompt[inv.id * 10 + 1] ? '#0891b2' : 'transparent', color: copiedPrompt[inv.id * 10 + 1] ? '#fff' : '#0891b2', textAlign: 'left', width: '100%' }}>
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
                                      style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: (busy || done) ? 'default' : 'pointer', fontSize: '0.78rem', background: done ? '#6366f1' : 'transparent', color: done ? '#fff' : '#6366f1', opacity: busy ? 0.6 : 1, textAlign: 'left', width: '100%' }}>
                                      {done ? '✓ Notified' : busy ? 'Sending…' : '🔔 Notify Dev'}
                                    </button>
                                  );
                                })()}
                                {inv.revokedAt && !inv.deletedAt && (
                                  <button onClick={() => { handleReInvite(inv.id); setExpandedActions(p => ({ ...p, [inv.id]: false })); }}
                                    style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#2563eb', textAlign: 'left', width: '100%' }}>
                                    Re-invite
                                  </button>
                                )}
                                {inv.deletedAt ? (
                                  <button onClick={() => { handlePermanentDelete(inv.id); setExpandedActions(p => ({ ...p, [inv.id]: false })); }}
                                    style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#991b1b', textAlign: 'left', width: '100%' }}>
                                    🗑️ Permanent Delete
                                  </button>
                                ) : (
                                  <button onClick={() => { handleDelete(inv.id); setExpandedActions(p => ({ ...p, [inv.id]: false })); }}
                                    style={{ padding: '0.3rem 0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#dc2626', textAlign: 'left', width: '100%' }}>
                                    🗑️ Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ display: activeTab === 'hg_queue' ? 'none' : 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
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
                          {(inv.harvestStatus === 'failed' || inv.harvestStatus === 'pending') && inv.ibeUrl && !inv.hgStatus && (
                            <button onClick={async () => { await apiClient.retryOnboardingHarvest(inv.id); await load(); }}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #2563eb', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#2563eb' }}>
                              🔄 Retry Harvest
                            </button>
                          )}
                          {!inv.hgStatus && (
                            <button onClick={async () => { await apiClient.moveToHgQueue(inv.id); await load(); }}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #fcd34d', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#d97706' }}>
                              ⚠ HG Queue
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
                          {inv.revokedAt && !inv.deletedAt && (
                            <button onClick={() => handleReInvite(inv.id)}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #2563eb', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#2563eb' }}>
                              Re-invite
                            </button>
                          )}
                          {inv.deletedAt ? (
                            <button onClick={() => handlePermanentDelete(inv.id)}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #991b1b', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: '#fee2e2', color: '#991b1b' }}>
                              Permanent Delete
                            </button>
                          ) : (
                            <button onClick={() => handleDelete(inv.id)}
                              style={{ padding: '0.25rem 0.6rem', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', background: 'transparent', color: '#dc2626' }}>
                              Delete
                            </button>
                          )}
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

      {/* Harvest modal — single tabbed view */}
      {harvestModal && (() => {
        const inv = harvestModal;
        const data = inv.harvestedData as Record<string, unknown> | null;
        const status = inv.harvestStatus;
        const statusColor: Record<string, string> = { complete: '#16a34a', failed: '#dc2626', harvesting: '#d97706', pending: '#9ca3af', queued: '#92400e' };
        const barColor: Record<string, string> = { complete: '#16a34a', failed: '#dc2626', harvesting: '#f59e0b', pending: '#e5e7eb', queued: '#fde68a' };
        const color = statusColor[status] ?? '#6b7280';

        const startedAt = inv.harvestStartedAt ? new Date(inv.harvestStartedAt) : new Date(inv.createdAt);
        const completedAt = inv.harvestCompletedAt ? new Date(inv.harvestCompletedAt) : null;
        const durationSec = completedAt ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000) : null;
        const EXPECTED_SEC = 600;
        const barPct = status === 'complete' ? 100
          : status === 'failed' ? 100
          : status === 'harvesting' ? Math.min(Math.round((harvestElapsed / EXPECTED_SEC) * 100), 95)
          : 0;

        // Split log into IBE part and Website part
        const fullLog = harvestLiveLog ?? inv.harvestLog ?? ''
        const splitIdx = fullLog.indexOf('Scraping marketing website')
        const ibeLog = splitIdx > 0 ? fullLog.slice(0, splitIdx).trimEnd() : fullLog
        const websiteLog = splitIdx > 0 ? fullLog.slice(splitIdx).trimEnd() : ''

        const rooms = Array.isArray(data?.['rooms']) ? (data!['rooms'] as unknown[]).length : null;
        const images = Array.isArray(data?.['images']) ? (data!['images'] as unknown[]).length : null;
        const amenities = Array.isArray(data?.['amenities']) ? (data!['amenities'] as unknown[]).length : null;
        const ratePlans = Array.isArray(data?.['discoveredRatePlanTypes']) ? (data!['discoveredRatePlanTypes'] as unknown[]).length : null;

        const d = data ?? {}
        const roomList = Array.isArray(d['rooms']) ? d['rooms'] as Record<string, unknown>[] : []
        const amenityList = Array.isArray(d['amenities']) ? d['amenities'] as string[] : []
        const imageList = Array.isArray(d['images']) ? d['images'] as string[] : []
        const ratePlanList = Array.isArray(d['discoveredRatePlanTypes']) ? d['discoveredRatePlanTypes'] as Record<string, unknown>[] : []
        const BOARD_FULL: Record<string, string> = { RO: 'Room Only', BB: 'Bed & Breakfast', HB: 'Half Board', FB: 'Full Board', AI: 'All Inclusive' }
        const boardFull = (code: string) => BOARD_FULL[code] ?? code
        const policyList = Array.isArray(d['policies']) ? d['policies'] as Record<string, unknown>[] : []
        const hasData = status === 'completed' || (status === 'failed' && roomList.length > 0)

        const TABS = [
          { id: 'status-ibe', label: '🔌 IBE Status' },
          { id: 'status-web', label: '🌐 Website Status' },
          { id: 'hotel', label: '🏨 Hotel Level' },
          { id: 'rooms', label: `🏠 Room Level${roomList.length ? ` (${roomList.length})` : ''}` },
          { id: 'rateplans', label: `🎫 Rate Plans${ratePlanList.length ? ` (${ratePlanList.flatMap(rp => [rp['hasRefundable'] ? 1 : 0, rp['hasNonRefundable'] ? 1 : 0]).reduce((a, b) => a + (b as number), 0)})` : ''}` },
          { id: 'board', label: `🍽️ Board Types` },
          { id: 'cancellation', label: '↩️ Cancellation' },
          { id: 'policies', label: `⚖️ Policies${policyList.length ? ` (${policyList.length})` : ''}` },
        ]

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) setHarvestModal(null); }}>
            <div style={{ background: '#fff', borderRadius: '10px', width: '1200px', maxWidth: '97vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Harvest — {inv.hotelName ?? 'Hotel'}</h3>
                  <span style={{ fontWeight: 700, fontSize: '0.75rem', color, background: `${color}18`, padding: '2px 10px', borderRadius: '4px' }}>{status.toUpperCase()}</span>
                  {status === 'harvesting' && <span style={{ fontSize: '0.82rem', color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>⏱ {Math.floor(harvestElapsed / 60)}:{String(harvestElapsed % 60).padStart(2, '0')}</span>}
                  {durationSec !== null && durationSec >= 0 && status !== 'harvesting' && <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Completed in {durationSec >= 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`}</span>}
                </div>
                <button onClick={() => setHarvestModal(null)} style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0, overflowX: 'auto' }}>
                {TABS.map(t => (
                  <button key={t.id}
                    onClick={() => setHarvestDetailTab(t.id)}
                    disabled={!['status-ibe', 'status-web'].includes(t.id) && !hasData}
                    style={{ padding: '0.7rem 1.1rem', background: 'transparent', border: 'none', borderBottom: harvestDetailTab === t.id ? '2px solid #2563eb' : '2px solid transparent', color: harvestDetailTab === t.id ? '#2563eb' : (!['status-ibe','status-web'].includes(t.id) && !hasData ? '#d1d5db' : '#6b7280'), fontWeight: harvestDetailTab === t.id ? 700 : 400, fontSize: '0.82rem', cursor: !['status-ibe','status-web'].includes(t.id) && !hasData ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Scrollable content */}
              <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>

                {/* Shared status bar for both status tabs */}
                {['status-ibe', 'status-web'].includes(harvestDetailTab) && (
                  <div style={{ background: '#f3f4f6', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '999px', width: `${barPct}%`, background: barColor[status] ?? '#e5e7eb', transition: status === 'harvesting' ? 'width 1s linear' : 'none' }} />
                  </div>
                )}

                {/* IBE Status tab */}
                {harvestDetailTab === 'status-ibe' && (
                  <>
                    {inv.ibeUrl && <div style={{ fontSize: '0.82rem' }}><span style={{ color: '#6b7280' }}>IBE: </span><a href={inv.ibeUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', wordBreak: 'break-all' }}>{inv.ibeUrl}</a></div>}
                    {status === 'harvesting' && <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>Scraping the booking engine — extracting rooms, rates, photos, and amenities.</p>}
                    {status === 'queued' && <p style={{ margin: 0, fontSize: '0.78rem', color: '#92400e' }}>In queue — waiting. Priority: <strong>{inv.source === 'self_registration' ? 'High' : inv.source === 'zoho' ? 'Low (CRM)' : 'Normal (OB agent)'}</strong></p>}
                    {status === 'pending' && <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>Waiting to start — harvest begins once the IBE URL is set.</p>}
                    {inv.failureReason && status === 'failed' && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.75rem', fontSize: '0.82rem', color: '#991b1b' }}><strong>Error:</strong> {inv.failureReason}</div>}
                    {ibeLog && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.3rem' }}>{status === 'harvesting' ? 'Live progress:' : 'IBE harvest log:'}</div>
                        <div style={{ background: '#0f172a', borderRadius: '6px', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 500, color: '#e2e8f0', overflowX: 'auto', maxHeight: '380px', overflowY: 'auto', lineHeight: 1.7 }}>
                          {ibeLog.split('\n').map((line, i) => {
                            const urlMatch = line.match(/\[url:(https?:\/\/[^\]]+)\]/)
                            if (urlMatch) {
                              const before = line.slice(0, urlMatch.index)
                              return (
                                <div key={i}>
                                  {before}
                                  <a href={urlMatch[1]} target="_blank" rel="noopener noreferrer"
                                    style={{ color: '#38bdf8', textDecoration: 'none', marginLeft: '0.5rem' }}>
                                    view →
                                  </a>
                                </div>
                              )
                            }
                            return <div key={i}>{line}</div>
                          })}
                        </div>
                      </div>
                    )}
                    {/* DataDome fallback — bookmarklet harvesting via user's browser */}
                    {/DataDome|page blocked by/i.test(inv.harvestLog ?? '') && (() => {
                      const buildBookmarklet = () => {
                        // Rules: NO double-quotes (Chrome truncates javascript: URIs at "), NO #, NO async/await
                        // CSS selectors use single-quote attribute values e.g. [class*='room-card']
                        // %%BASE%% replaced via useEffect setAttribute to bypass React 18 javascript: sanitisation
                        const bm = `(function(){
function toast(m,ok){var d=document.createElement('div');d.style.cssText='position:fixed;top:20px;right:20px;z-index:2147483647;background:'+(ok?'rgb(21,128,61)':'rgb(30,41,59)')+';color:white;padding:14px 18px;border-radius:8px;font-size:14px;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:320px;line-height:1.5;';d.textContent=m;document.body.appendChild(d);setTimeout(function(){d.remove();},ok?6000:4000);}
var token=new URLSearchParams(location.search).get('hg_token');
if(!token){toast('Open this page using the HG Admin button');return;}
function tx(el){return el?(el.textContent||'').replace(/\\s+/g,' ').trim():'';}
function gi(el){return[].slice.call(el.querySelectorAll('img')).map(function(i){return i.src||i.getAttribute('data-src')||'';}).filter(function(s){return s.indexOf('https')===0;}).slice(0,6);}
var cards=document.querySelectorAll('[class*=room-card],[class*=RoomCard],[class*=accommodation-card],[class*=room-item]');
if(!cards.length){toast('Rooms not visible yet - wait for page to load');return;}
var rooms=[],bds={},cxs={};
[].forEach.call(cards,function(c){
  var n=tx(c.querySelector('h2,h3,h4'));
  if(!n||n.length>200)return;
  var desc=tx(c.querySelector('[class*=description],[class*=detail],[class*=desc],[class*=summary]')).slice(0,400);
  var ams=[].slice.call(c.querySelectorAll('[class*=amenity],[class*=feature],[class*=facil],[class*=service]')).map(function(a){return tx(a);}).filter(function(s){return s&&s.length>1&&s.length<60;}).slice(0,15);
  var sz=tx(c.querySelector('[class*=size],[class*=surface],[class*=sqm],[class*=area]'));
  var occ=tx(c.querySelector('[class*=occupan],[class*=capacity],[class*=pax]'));
  var plans=[];
  // Try rate rows inside the card first, then look at sibling containers
  var rateEls=c.querySelectorAll('[class*=rate],[class*=offer],[class*=package],[class*=plan],[class*=Price]');
  if(!rateEls.length){
    // D-Edge often places rate rows as siblings — grab the next sibling container
    var next=c.nextElementSibling;
    while(next&&!next.matches('[class*=room],[class*=Room]')){
      var sub=next.querySelectorAll('[class*=rate],[class*=price],[class*=offer]');
      if(sub.length){rateEls=sub;break;}
      next=next.nextElementSibling;
    }
  }
  [].forEach.call(rateEls,function(r){
    var pn=tx(r.querySelector('h3,h4,h5,[class*=name],[class*=title]'));
    if(!pn||pn.length<2||pn.length>150)return;
    var price=tx(r.querySelector('[class*=price],[class*=amount],[class*=total],[class*=cost]'));
    // Grab bullet-separated details line (contains board + cancellation info)
    var details=tx(r).replace(/\\s+/g,' ');
    var cancel='';var board='';
    if(/free cancel|refund/i.test(details))cancel=details.split('.')[0].trim().slice(0,120);
    if(/room only|breakfast|half board|full board|all incl/i.test(details))board=details.slice(0,60);
    if(cancel)cxs[cancel]=1;if(board)bds[board]=1;
    plans.push({name:pn,board:board,cancellation:cancel,price:price,details:details.slice(0,200)});
  });
  rooms.push({name:n,description:desc,images:gi(c),amenities:ams,size:sz,maxOccupancy:occ,ratePlans:plans});
});
if(!rooms.length){toast('No room names found on this page');return;}
toast('Saving '+rooms.length+' rooms...');
fetch('%%BASE%%/api/v1/hotel-onboarding/scrape-submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token,rooms:rooms,boardTypes:Object.keys(bds),cancellationPolicies:Object.keys(cxs),url:location.href})}).then(function(r){return r.json();}).then(function(d){d.ok?toast(d.roomsFound+' rooms saved - close tab and return to HG Admin',true):toast('Error: '+(d.error||'unknown'));}).catch(function(){toast('Network error - check connection');});
})();`
                        return 'javascript:void ' + bm.replace(/\n/g, '')
                      }

                      const openAndPoll = async () => {
                        if (!inv.ibeUrl) return
                        const snapshotCompletedAt = inv.harvestCompletedAt ?? null
                        // Open 4 blank windows synchronously within user gesture (all before any await)
                        const ibeBase = inv.ibeUrl ?? ''
                        const wins = [
                          window.open('', '_blank'),  // D+1  2A+0C
                          window.open('', '_blank'),  // D+30 2A+1C
                          window.open('', '_blank'),  // D+90 3A+0C
                          window.open('', '_blank'),  // D+1  1A+0C (single rooms)
                        ]
                        const opened = wins.filter(w => !!w).length
                        setScrapeTabsInfo({ opened, total: wins.length })
                        try {
                          const { token } = await apiClient.getScrapeToken(inv.id)
                          const addD = (n: number) => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10) }
                          const sep = ibeBase.includes('?') ? '&' : '?'
                          const stripOcc = (url: string) => url.replace(/[&?]selected(Adult|Child|Infant)Count=\d+/g, '').replace(/[&?]arrival(Date|Date)=[^&]*/g, '').replace(/[&?]departure(Date)=[^&]*/g, '')
                          const clean = stripOcc(ibeBase)
                          const cleanSep = clean.includes('?') ? '&' : '?'
                          const patterns = [
                            `${clean}${cleanSep}selectedAdultCount=2&selectedChildCount=0&arrivalDate=${addD(1)}&departureDate=${addD(2)}&hg_token=${token}`,
                            `${clean}${cleanSep}selectedAdultCount=2&selectedChildCount=1&arrivalDate=${addD(30)}&departureDate=${addD(31)}&hg_token=${token}`,
                            `${clean}${cleanSep}selectedAdultCount=3&selectedChildCount=0&arrivalDate=${addD(90)}&departureDate=${addD(91)}&hg_token=${token}`,
                            `${clean}${cleanSep}selectedAdultCount=1&selectedChildCount=0&arrivalDate=${addD(1)}&departureDate=${addD(2)}&hg_token=${token}`,
                          ]
                          wins.forEach((w, i) => { if (w) w.location.href = patterns[i] })
                          setScrapeTabOpen(true)
                          if (scrapeTabPollRef.current) clearInterval(scrapeTabPollRef.current)
                          scrapeTabPollRef.current = setInterval(async () => {
                            try {
                              const status = await apiClient.getOnboardingHarvestStatus(inv.id)
                              if (status.harvestCompletedAt && status.harvestCompletedAt !== snapshotCompletedAt) {
                                clearInterval(scrapeTabPollRef.current!)
                                scrapeTabPollRef.current = null
                                setScrapeTabOpen(false)
                                setScrapeTabsInfo(null)
                                setHarvestModal(null)
                                await load()
                              }
                            } catch {}
                          }, 4000)
                        } catch { wins.forEach(w => w?.close()) }
                      }

                      const step = (n: number, text: string) => (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <span style={{ background: '#ea580c', color: '#fff', borderRadius: '50%', width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, marginTop: '0.05rem' }}>{n}</span>
                          <span style={{ color: '#7c2d12', lineHeight: 1.55 }}>{text}</span>
                        </div>
                      )

                      return (
                        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.82rem' }}>
                          <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: '0.6rem', fontSize: '0.85rem' }}>
                            🔒 Booking engine rooms blocked — a quick browser setup is needed
                          </div>

                          {!bookmarkletReady ? (
                            /* ── Setup wizard (one-time, per browser) ── */
                            <>
                              <div style={{ color: '#92400e', marginBottom: '0.6rem' }}>
                                Do this <strong>once</strong> in your browser — takes about 30 seconds:
                              </div>
                              {step(1, <>If you don&rsquo;t see a bookmarks bar at the top of your browser, press <kbd style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '3px', padding: '0 4px', fontFamily: 'monospace', fontSize: '0.8rem' }}>Ctrl+Shift+B</kbd> to show it.</>)}
                              {step(2, <>Drag the orange button below to the bookmarks bar at the top of your browser. It will appear there as a saved button called <strong>&ldquo;HG Rooms&rdquo;</strong>.</>)}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.3rem 0 0.4rem 1.75rem', flexWrap: 'wrap' }}>
                                <a
                                  ref={(el) => {
                                    if (!el) return;
                                    // Tiny loader: fetches actual code from server, no length limit, no re-drag needed on updates
                                    const loader = `javascript:void fetch('${window.location.origin}/api/v1/hotel-onboarding/bm.js').then(function(r){return r.text();}).then(eval);`
                                    el.setAttribute('href', loader)
                                  }}
                                  href="about:blank"
                                  onClick={e => e.preventDefault()}
                                  draggable
                                  style={{ padding: '0.3rem 0.75rem', background: '#d97706', color: '#fff', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', cursor: 'grab', whiteSpace: 'nowrap', userSelect: 'none', border: '2px dashed #b45309', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                  title="Drag this to your bookmarks bar"
                                >
                                  <img src="/hg-favicon.png" alt="" style={{ width: '14px', height: '14px', borderRadius: '2px', flexShrink: 0, pointerEvents: 'none' }} />
                                  🏨 HG Rooms
                                </a>
                                <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>← drag this to your bookmarks bar</span>
                              </div>
                              <div style={{ marginLeft: '1.75rem', marginBottom: '0.5rem', color: '#9ca3af', fontSize: '0.76rem', fontStyle: 'italic' }}>
                                💡 You may see a long line of code at the bottom of your browser when hovering — that&rsquo;s normal. Just drag the orange button up to the bar.
                              </div>
                              {step(3, 'Click the button below once you see "HG Rooms" in your bookmarks bar.')}
                              <button
                                onClick={() => {
                                  try { localStorage.setItem('hg-bookmarklet-setup', 'done') } catch {}
                                  setBookmarkletReady(true)
                                }}
                                style={{ marginLeft: '1.75rem', padding: '0.35rem 1rem', background: '#15803d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                              >
                                ✓ Done, &ldquo;HG Rooms&rdquo; is in my bookmarks bar
                              </button>
                            </>
                          ) : scrapeTabOpen ? (
                            /* ── Waiting for bookmarklet click ── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <div style={{ color: '#15803d', fontWeight: 600 }}>
                                ✓ {scrapeTabsInfo ? `${scrapeTabsInfo.opened} of ${scrapeTabsInfo.total}` : '?'} tabs opened
                              </div>
                              {scrapeTabsInfo && scrapeTabsInfo.opened < scrapeTabsInfo.total && (
                                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#92400e' }}>
                                  ⚠ {scrapeTabsInfo.total - scrapeTabsInfo.opened} tab(s) blocked by Chrome.<br/>
                                  Click the <strong>🔒 icon</strong> in the address bar → <strong>Always allow popups</strong> from this site → retry.
                                </div>
                              )}
                              <div style={{ color: '#7c2d12', lineHeight: 1.6, fontSize: '0.82rem' }}>
                                4 patterns: <strong>2A D+1</strong> · <strong>2A+1C D+30</strong> · <strong>3A D+90</strong> · <strong>1A D+1</strong><br/>
                                For <strong>each open tab</strong>, once rooms load: click <strong>&ldquo;HG Rooms&rdquo;</strong> bookmark. Results merge automatically.
                              </div>
                              <div style={{ color: '#9ca3af', fontSize: '0.77rem' }}>Waiting… panel closes after the first save.</div>
                              <div style={{ marginTop: '0.3rem', display: 'flex', gap: '1rem' }}>
                                <button onClick={() => setScrapeTabOpen(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.77rem', textDecoration: 'underline', padding: 0 }}>
                                  Cancel
                                </button>
                                <button onClick={() => {
                                  setScrapeTabOpen(false)
                                  try { localStorage.removeItem('hg-bookmarklet-setup') } catch {}
                                  setBookmarkletReady(false)
                                }} style={{ background: 'none', border: 'none', color: '#d97706', cursor: 'pointer', fontSize: '0.77rem', textDecoration: 'underline', padding: 0 }}>
                                  Don&rsquo;t have the bookmark? Set it up here
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── Ready to open ── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <div style={{ color: '#7c2d12', marginBottom: '0.2rem', lineHeight: 1.55 }}>
                                Hotel info was harvested. Room data needs to be fetched via your browser.
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                <button
                                  onClick={openAndPoll}
                                  style={{ padding: '0.4rem 1.1rem', background: '#ea580c', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}
                                >
                                  🌐 Open Booking Engine in My Browser
                                </button>
                                <span style={{ color: '#92400e', fontSize: '0.79rem' }}>
                                  Then click <strong>HG Rooms</strong> in your bookmarks bar when rooms are visible
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  try { localStorage.removeItem('hg-bookmarklet-setup') } catch {}
                                  setBookmarkletReady(false)
                                }}
                                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline', padding: 0, alignSelf: 'flex-start' }}
                              >
                                Need to set up the bookmark again?
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {inv.harvestNotifiedAt && <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Staff notified: {new Date(inv.harvestNotifiedAt).toLocaleString()}</div>}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {status === 'harvesting' && (
                        <button onClick={async () => { if (!confirm('Cancel the running harvest?')) return; await apiClient.cancelHarvest(inv.id); setHarvestModal(null); await load(); }}
                          style={{ padding: '0.4rem 1rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                          ✕ Cancel Harvest
                        </button>
                      )}
                      {(status === 'failed' || status === 'pending') && inv.ibeUrl && (
                        <button onClick={async () => { await apiClient.retryOnboardingHarvest(inv.id); setHarvestModal(null); await load(); }}
                          style={{ padding: '0.4rem 1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                          🔄 Retry Harvest
                        </button>
                      )}
                      {inv.ibeUrl && status !== 'harvesting' && status !== 'queued' && (
                        <button onClick={async () => { if (!confirm('Re-harvest from scratch? All previous harvest data will be cleared.')) return; await apiClient.reharvestOnboarding(inv.id); setHarvestModal(null); await load(); }}
                          style={{ padding: '0.4rem 1rem', background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
                          ↺ Re-harvest (scratch)
                        </button>
                      )}
                      {!inv.hgStatus && status !== 'harvesting' && (
                        <button onClick={async () => { await apiClient.moveToHgQueue(inv.id); setHarvestModal(null); await load(); }}
                          style={{ padding: '0.4rem 1rem', background: 'transparent', color: '#d97706', border: '1px solid #fcd34d', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
                          ⚠ HG Queue
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Website Status tab */}
                {harvestDetailTab === 'status-web' && (
                  <>
                    {inv.websiteUrl && <div style={{ fontSize: '0.82rem' }}><span style={{ color: '#6b7280' }}>Website: </span><a href={inv.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', wordBreak: 'break-all' }}>{inv.websiteUrl}</a></div>}
                    {websiteLog ? (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.3rem' }}>Marketing site harvest log:</div>
                        <div style={{ background: '#0f172a', borderRadius: '6px', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 500, color: '#e2e8f0', whiteSpace: 'pre', overflowX: 'auto', maxHeight: '380px', overflowY: 'auto', lineHeight: 1.7 }}>
                          {websiteLog}
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af' }}>
                        {status === 'complete' ? 'No website URL was available for this invitation.' : 'Marketing site scraping runs after the IBE harvest completes.'}
                      </p>
                    )}
                  </>
                )}

                {/* Hotel Level tab */}
                {harvestDetailTab === 'hotel' && (
                  <>
                    {/* Basic info */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.82rem' }}>
                      {[{ label: 'Name', value: d['name'] }, { label: 'Stars', value: d['starRating'] }]
                        .filter(r => r.value != null && r.value !== '').map(r => (
                          <div key={r.label} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                            <div style={{ color: '#6b7280', fontSize: '0.7rem' }}>{r.label}</div>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{String(r.value)}</div>
                          </div>
                        ))}
                    </div>

                    {/* Contact Info section */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', color: '#374151' }}>Contact Info</div>
                      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
                        {d['address'] && <div><span style={{ color: '#6b7280', fontSize: '0.75rem' }}>📍 Address: </span><span style={{ fontWeight: 600 }}>{String(d['address'])}</span>{d['city'] ? `, ${String(d['city'])}` : ''}{d['country'] ? `, ${String(d['country'])}` : ''}</div>}
                        {d['latitude'] != null && d['longitude'] != null && (
                          <div>
                            <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>🗺 Coordinates: </span>
                            <span style={{ fontWeight: 600 }}>{Number(d['latitude']).toFixed(5)}, {Number(d['longitude']).toFixed(5)}</span>
                            <a href={`https://www.google.com/maps?q=${d['latitude']},${d['longitude']}`} target="_blank" rel="noopener noreferrer"
                              style={{ marginLeft: '0.5rem', color: '#2563eb', fontSize: '0.75rem' }}>View map ↗</a>
                          </div>
                        )}
                        {d['phone'] && <div><span style={{ color: '#6b7280', fontSize: '0.75rem' }}>📞 Phone: </span><span style={{ fontWeight: 600 }}>{String(d['phone'])}</span></div>}
                        {d['email'] && <div><span style={{ color: '#6b7280', fontSize: '0.75rem' }}>✉ Email: </span><a href={`mailto:${String(d['email'])}`} style={{ fontWeight: 600, color: '#2563eb' }}>{String(d['email'])}</a></div>}
                        {inv.websiteUrl && <div><span style={{ color: '#6b7280', fontSize: '0.75rem' }}>🌐 Website: </span><a href={inv.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: '#2563eb' }}>{inv.websiteUrl}</a></div>}
                        {!d['address'] && !d['phone'] && !d['email'] && d['latitude'] == null && !inv.websiteUrl && (
                          <div style={{ color: '#9ca3af', fontSize: '0.78rem' }}>No contact info retrieved</div>
                        )}
                      </div>
                    </div>

                    {d['description'] && <div><div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.3rem' }}>Description</div><div style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.6, background: '#f9fafb', padding: '0.75rem', borderRadius: '6px' }}>{String(d['description'])}</div></div>}
                    {imageList.length > 0 && <div><div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.3rem' }}>Images ({imageList.length})</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>{imageList.map((url, i) => <img key={i} src={url} alt="" style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '5px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />)}</div></div>}
                    {amenityList.length > 0 && <div><div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.3rem' }}>Amenities ({amenityList.length})</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>{amenityList.map((a, i) => <span key={i} style={{ background: '#f0fdf4', color: '#166534', padding: '2px 9px', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid #bbf7d0' }}>{a}</span>)}</div></div>}
                  </>
                )}

                {/* Room Level tab */}
                {harvestDetailTab === 'rooms' && roomList.map((room, i) => {
                  const imgs = Array.isArray(room['images']) ? room['images'] as string[] : []
                  const plans = Array.isArray(room['ratePlans']) ? room['ratePlans'] as Record<string,unknown>[] : []
                  const roomAms = Array.isArray(room['amenities']) ? room['amenities'] as string[] : []
                  return (
                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', fontSize: '0.82rem' }}>
                    {/* Header */}
                    <div style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{String(room['name'] ?? '')}</span>
                      {room['size'] && <span style={{ color: '#6b7280', fontSize: '0.76rem' }}>📐 {String(room['size'])}</span>}
                      {room['maxOccupancy'] && <span style={{ color: '#6b7280', fontSize: '0.76rem' }}>👥 {String(room['maxOccupancy'])}</span>}
                      {room['bedConfiguration'] && <span style={{ color: '#6b7280', fontSize: '0.76rem' }}>🛏 {String(room['bedConfiguration'])}</span>}
                      {imgs.length > 0 && (
                        <button onClick={() => setRoomImgPopup({ name: String(room['name'] ?? ''), images: imgs })}
                          style={{ marginLeft: 'auto', background: 'none', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '1px 7px', color: '#2563eb', fontSize: '0.76rem', cursor: 'pointer' }}>
                          🖼 {imgs.length} photos
                        </button>
                      )}
                    </div>
                    {/* Body: two columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: imgs.length ? '180px 1fr' : '1fr', gap: 0 }}>
                      {/* Left: image thumbnails */}
                      {imgs.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '6px', background: '#0f172a' }}>
                          {imgs.slice(0, 4).map((url, j) => (
                            <img key={j} src={url} alt="" style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '3px' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          ))}
                          {imgs.length > 4 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.72rem', padding: '2px' }}>+{imgs.length - 4} more</div>}
                        </div>
                      )}
                      {/* Right: all data */}
                      <div style={{ padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {room['description'] && (
                          <div style={{ color: '#374151', lineHeight: 1.5, fontSize: '0.8rem' }}>{String(room['description'])}</div>
                        )}
                        {roomAms.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {roomAms.map((a, j) => <span key={j} style={{ background: '#f0fdf4', color: '#166534', padding: '1px 7px', borderRadius: '3px', fontSize: '0.73rem', border: '1px solid #bbf7d0' }}>{a}</span>)}
                          </div>
                        )}
                        {plans.length > 0 && (
                          <div>
                            <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.76rem', marginBottom: '0.2rem' }}>Rate Plans</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {plans.map((pl, j) => (
                                <div key={j} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '4px 8px', fontSize: '0.76rem' }}>
                                  <span style={{ fontWeight: 600 }}>{String(pl['name'] ?? '')}</span>
                                  {pl['board'] && <span style={{ color: '#6b7280', marginLeft: '0.4rem' }}>· {String(pl['board'])}</span>}
                                  {pl['price'] && <span style={{ color: '#059669', marginLeft: '0.4rem' }}>{String(pl['price'])}</span>}
                                  {pl['cancellation'] && <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: '1px' }}>↩ {String(pl['cancellation'])}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                      {/* Detailed occupancy breakdown */}
                  </div>
                  )
                })}

                {/* Board Types tab — deduplicated by boardCode */}
                {harvestDetailTab === 'board' && (() => {
                  const seen = new Set<string>()
                  const validBoards = ratePlanList.filter(rp => {
                    const code = String(rp['boardCode'] ?? '')
                    if (!code || seen.has(code)) return false
                    seen.add(code); return true
                  })
                  return validBoards.length === 0
                    ? <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>No board types retrieved</div>
                    : validBoards.map((rp, i) => (
                      <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '3px 12px', borderRadius: '5px', fontSize: '0.9rem' }}>{boardFull(String(rp['boardCode']))}</span>
                      </div>
                    ))
                })()}

                {/* Rate Plans tab — two sections */}
                {harvestDetailTab === 'rateplans' && (() => {
                  const valid = ratePlanList.filter(r => r['boardCode'])
                  if (valid.length === 0) return <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>No rate plans found</div>

                  // Section 1: combinations (board × refundable/NR)
                  const combos: Array<{ board: string; refundable: boolean }> = []
                  for (const rp of valid) {
                    if (rp['hasRefundable']) combos.push({ board: String(rp['boardCode']), refundable: true })
                    if (rp['hasNonRefundable']) combos.push({ board: String(rp['boardCode']), refundable: false })
                  }

                  // Section 2: all raw rate plan names
                  const rawNames: string[] = []
                  for (const rp of valid) {
                    if (rp['refundableExampleName']) rawNames.push(String(rp['refundableExampleName']))
                    if (rp['nonRefundableExampleName']) rawNames.push(String(rp['nonRefundableExampleName']))
                    if (!rp['refundableExampleName'] && !rp['nonRefundableExampleName'] && rp['boardCodeRawName']) rawNames.push(String(rp['boardCodeRawName']))
                  }

                  return (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {combos.map((c, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', border: `1px solid ${c.refundable ? '#bbf7d0' : '#fca5a5'}`, borderRadius: '8px', padding: '0.75rem 1rem' }}>
                            <span style={{ fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '3px 12px', borderRadius: '5px', fontSize: '0.9rem' }}>{boardFull(c.board)}</span>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: c.refundable ? '#16a34a' : '#dc2626' }}>
                              {c.refundable ? '✓ Refundable' : '✗ Non-Refundable'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {rawNames.length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: '0.5rem' }}>Identified rate plan names / codes</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            {rawNames.map((n, i) => (
                              <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#374151' }}>
                                {n}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}

                {/* Cancellation tab — board + policy, no raw names */}
                {harvestDetailTab === 'cancellation' && (() => {
                  // Deduplicate by policy content — show unique policies only
                  const seenPolicies = new Set<string>()
                  const refundable = ratePlanList.filter(rp => {
                    if (!rp['boardCode'] || !rp['hasRefundable']) return false
                    const cp = rp['refundableCancellationPolicy'] as Record<string, unknown> | null
                    const key = cp ? JSON.stringify({ f: cp['freeCancellationUntil'], p: cp['penaltyType'], v: cp['penaltyValue'] }) : '__no_policy__'
                    if (seenPolicies.has(key)) return false
                    seenPolicies.add(key); return true
                  })
                  const hasNR = ratePlanList.some(rp => rp['boardCode'] && rp['hasNonRefundable'])
                  const nonRefundable = hasNR ? [true] : []
                  if (refundable.length === 0 && nonRefundable.length === 0)
                    return <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>No cancellation policies found</div>
                  return (
                    <>
                      {refundable.map((rp, i) => {
                        const cp = rp['refundableCancellationPolicy'] as Record<string, unknown> | null
                        return (
                          <div key={i} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1rem', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ fontWeight: 600, color: '#166534', marginBottom: '0.15rem' }}>✓ Refundable</div>
                            {cp?.['freeCancellationUntil'] && <div><strong>Free cancellation until:</strong> {String(cp['freeCancellationUntil'])}</div>}
                            {cp?.['penaltyType'] && <div><strong>Penalty type:</strong> {String(cp['penaltyType'])}</div>}
                            {cp?.['penaltyValue'] != null && <div><strong>Penalty amount:</strong> {String(cp['penaltyValue'])}</div>}
                            {cp?.['description'] && <div style={{ color: '#374151', marginTop: '0.2rem' }}>{String(cp['description'])}</div>}
                            {!cp && <div style={{ color: '#6b7280' }}>No detailed policy captured</div>}
                          </div>
                        )
                      })}
                      {nonRefundable.length > 0 && (
                        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '1rem', fontSize: '0.82rem', color: '#991b1b' }}>
                          ✗ Non-Refundable — no free cancellation
                        </div>
                      )}
                    </>
                  )
                })()}

                {/* General Policies tab */}
                {harvestDetailTab === 'policies' && (
                  policyList.length === 0
                    ? <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>No general policies retrieved</div>
                    : policyList.map((p, i) => (
                      <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                        {p['type'] && <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem', color: '#374151' }}>{String(p['type'])}</div>}
                        {p['description'] && <div style={{ fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.6 }}>{String(p['description'])}</div>}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Comment modal */}
      {commentModal && (() => {
        const isIbe = commentModal.type === 'ibe';
        const title = isIbe ? 'IBE Investigation Notes' : 'ARI Investigation Notes';
        const save = async () => {
          const val = commentModal.value;
          if (isIbe) {
            setHgNotes(p => ({ ...p, [commentModal.invId]: val }));
            await apiClient.saveOnboardingNotes(commentModal.invId, val).catch(() => {});
          } else {
            setHgAriNotes(p => ({ ...p, [commentModal.invId]: val }));
            await apiClient.saveOnboardingAriNotes(commentModal.invId, val).catch(() => {});
          }
          setCommentModal(null);
        };
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) save(); }}>
            <div style={{ background: '#fff', borderRadius: '10px', padding: '1.5rem', width: '480px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
                <button onClick={() => setCommentModal(null)} style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>×</button>
              </div>
              <textarea
                autoFocus
                rows={6}
                value={commentModal.value}
                onChange={e => setCommentModal(m => m ? { ...m, value: e.target.value } : m)}
                placeholder={`${title}…`}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button onClick={() => setCommentModal(null)}
                  style={{ padding: '0.4rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', background: 'transparent', color: '#374151' }}>
                  Cancel
                </button>
                <button onClick={save}
                  style={{ padding: '0.4rem 1rem', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', background: '#2563eb', color: '#fff', fontWeight: 600 }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Room image lightbox */}
      {roomImgPopup && (
        <div onClick={() => setRoomImgPopup(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '10px', width: '900px', maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 100px rgba(0,0,0,0.5)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{roomImgPopup.name} — {roomImgPopup.images.length} photos</span>
              <button onClick={() => setRoomImgPopup(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>×</button>
            </div>
            {/* Grid */}
            <div style={{ overflowY: 'auto', padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem' }}>
              {roomImgPopup.images.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                  <img src={url} alt={`${roomImgPopup.name} photo ${i + 1}`}
                    style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '6px', display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
