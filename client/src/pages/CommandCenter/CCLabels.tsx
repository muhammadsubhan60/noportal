import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import {
  MagnifyingGlassIcon, XMarkIcon, ArrowTopRightOnSquareIcon,
  ClockIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon,
  ArrowPathIcon, SignalIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');
const PAGE_SIZE = 35;

// ── Tracking status config ─────────────────────────────────────
const TS_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  not_scanned_yet:    { label: 'Not Scanned Yet',    bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  in_transit:         { label: 'In Transit',          bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  out_for_delivery:   { label: 'Out for Delivery',    bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  delivered:          { label: 'Delivered',           bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  exception_problem:  { label: 'Exception / Problem', bg: '#FFF5F5', color: '#DC2626', border: '#FECACA' },
  returned_to_sender: { label: 'Returned to Sender',  bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
  pending_pickup:     { label: 'Pending Pickup',      bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  delayed:            { label: 'Delayed',             bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  voided:             { label: 'Voided',              bg: '#F8FAFC', color: '#64748B', border: '#CBD5E1' },
};
const TS_KEYS = Object.keys(TS_CFG);

function resolveTs(ts?: string): string {
  if (!ts || ts === 'not_scanned') return 'not_scanned_yet';
  if (ts === 'exception') return 'exception_problem';
  return TS_CFG[ts] ? ts : 'not_scanned_yet';
}

function getTrackUrl(carrier: string, id: string): string {
  const enc = encodeURIComponent(id);
  if (carrier === 'UPS')   return `https://www.ups.com/track?tracknum=${enc}`;
  if (carrier === 'FedEx') return `https://www.fedex.com/fedextrack/?trknbr=${enc}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc}`;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 7 ? `${days}d ago` : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Label {
  _id: string; trackingId: string; carrier: string; isBulk: boolean;
  vendorName: string; shippingService?: string;
  from_name: string; from_city: string; from_state: string;
  to_name: string; to_city: string; to_state: string;
  weight: number; price: number;
  trackingStatus?: string; createdAt: string;
  user?: { _id: string; firstName: string; lastName: string; email: string };
  vendor?: { _id: string; name: string; source?: string };
}

const PORTAL_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  shippershub: { label: 'ShippersHub', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  labelcrow:   { label: 'Label Crow',  bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  shiplabel:   { label: 'ShipLabel',   bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
  manual:      { label: 'Manual',      bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
};

const PortalBadge = ({ source }: { source?: string }) => {
  const cfg = PORTAL_CFG[source || ''] || { label: source || '—', bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
  return (
    <span style={{ fontSize: '0.63rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap', fontFamily: FONT }}>
      {cfg.label}
    </span>
  );
};

interface Vendor { _id: string; name: string; carrier: string; }
interface User   { _id: string; firstName: string; lastName: string; email: string; }

// ── Inline status dropdown ─────────────────────────────────────
const StatusCell = ({ label, onUpdate }: { label: Label; onUpdate: (id: string, ts: string) => void }) => {
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const ts  = resolveTs(label.trackingStatus);
  const cfg = TS_CFG[ts];
  const { token } = useAuth();

  const apply = async (newTs: string) => {
    if (newTs === ts) { setOpen(false); return; }
    setSaving(true);
    try {
      await axios.patch(
        `${API_BASE}/labels/${label._id}/tracking-status`,
        { trackingStatus: newTs },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      onUpdate(label._id, newTs);
    } catch {}
    setSaving(false);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        style={{ padding: '3px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT }}
      >
        {saving ? '…' : cfg.label}
        {!saving && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', minWidth: 180, overflow: 'hidden' }}>
            {TS_KEYS.map(k => {
              const c = TS_CFG[k];
              return (
                <button
                  key={k}
                  onClick={() => apply(k)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.45rem 0.85rem', background: k === ts ? `${c.color}10` : 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: '0.76rem', fontWeight: k === ts ? 700 : 400, color: c.color, textAlign: 'left' }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0, display: 'inline-block' }} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ── Status History Modal ───────────────────────────────────────
const HistoryModal = ({ label, onClose }: { label: Label; onClose: () => void }) => {
  const { token } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_BASE}/labels/${label._id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setHistory(r.data?.label?.trackingStatusHistory || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [label._id, token]);

  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)' }}>
      <div className="db-card" style={{ width: 480, maxWidth: '95vw', maxHeight: '80vh', overflow: 'auto', padding: '1.5rem', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>Status History</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontFamily: 'monospace', marginTop: 3 }}>{label.trackingId}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 2 }}><XMarkIcon style={{ width: 18, height: 18 }} /></button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--navy-400)', fontFamily: FONT, fontSize: '0.8rem' }}>Loading…</div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--navy-400)', fontFamily: FONT, fontSize: '0.8rem' }}>No history recorded</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map((h, i) => {
              const cfg = TS_CFG[resolveTs(h.status)] || TS_CFG.not_scanned_yet;
              return (
                <div key={i} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, flexShrink: 0, marginTop: 3 }} />
                    {i < history.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--navy-200)', marginTop: 4 }} />}
                  </div>
                  <div style={{ paddingBottom: 12, flex: 1 }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: cfg.color, fontFamily: FONT }}>{cfg.label}</span>
                    {h.note && <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 2, fontFamily: FONT }}>{h.note}</div>}
                    <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 2, fontFamily: FONT }}>
                      {new Date(h.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {h.updatedBy && ` · by ${h.updatedBy.firstName} ${h.updatedBy.lastName}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default function CCLabels() {
  const { token }    = useAuth();
  const [params] = useSearchParams();

  const [labels,      setLabels]      = useState<Label[]>([]);
  const [total,       setTotal]       = useState(0);
  const [totalPages,  setTotalPages]  = useState(1);
  const [loading,     setLoading]     = useState(true);

  const [search,      setSearch]      = useState(params.get('search') || '');
  const [tsFilter,    setTsFilter]    = useState<string[]>(params.get('trackingStatus') ? params.get('trackingStatus')!.split(',') : []);
  const [tsDropOpen,  setTsDropOpen]  = useState(false);
  const [vendorId,    setVendorId]    = useState(params.get('vendorId') || '');
  const [userId,      setUserId]      = useState(params.get('userId') || '');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [page,        setPage]        = useState(1);

  const [vendors,     setVendors]     = useState<Vendor[]>([]);
  const [users,       setUsers]       = useState<User[]>([]);

  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkTs,      setBulkTs]      = useState('');
  const [applying,    setApplying]    = useState(false);
  const [bulkMsg,     setBulkMsg]     = useState('');

  const [histLabel,      setHistLabel]      = useState<Label | null>(null);
  const [masterTracking, setMasterTracking] = useState(false);
  const [trackMsg,       setTrackMsg]       = useState('');

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // Load vendors + users for filter dropdowns
  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/vendors`, { headers: authH() }),
      axios.get(`${API_BASE}/users`,   { headers: authH(), params: { limit: 500 } }),
    ]).then(([vr, ur]) => {
      setVendors(vr.data.vendors || vr.data || []);
      setUsers((ur.data.users || ur.data || []).slice(0, 500));
    }).catch(() => {});
  }, [authH]);

  const fetchLabels = useCallback(() => {
    setLoading(true);
    const p: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
    if (search)            p.search         = search;
    if (tsFilter.length)   p.trackingStatus = tsFilter.join(',');
    if (vendorId)          p.vendorId       = vendorId;
    if (userId)   p.userId          = userId;
    if (dateFrom) p.dateFrom        = dateFrom;
    if (dateTo)   p.dateTo          = dateTo;

    axios.get(`${API_BASE}/labels/cc-all`, { headers: authH(), params: p })
      .then(r => {
        setLabels(r.data.labels || []);
        setTotal(r.data.total || 0);
        setTotalPages(r.data.totalPages || 1);
        setSelected(new Set());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, tsFilter.join(','), vendorId, userId, dateFrom, dateTo, authH]);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  const onUpdate = (id: string, newTs: string) =>
    setLabels(ls => ls.map(l => l._id === id ? { ...l, trackingStatus: newTs } : l));

  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(s => s.size === labels.length ? new Set() : new Set(labels.map(l => l._id)));

  const applyBulk = async () => {
    if (!bulkTs || selected.size === 0) return;
    setApplying(true);
    setBulkMsg('');
    try {
      const ids = Array.from(selected);
      await Promise.all(
        ids.map(id => axios.patch(`${API_BASE}/labels/${id}/tracking-status`, { trackingStatus: bulkTs }, { headers: authH() }))
      );
      setLabels(ls => ls.map(l => selected.has(l._id) ? { ...l, trackingStatus: bulkTs } : l));
      setBulkMsg(`Updated ${ids.length} label${ids.length > 1 ? 's' : ''}`);
      setSelected(new Set());
      setBulkTs('');
      setTimeout(() => setBulkMsg(''), 3000);
    } catch { setBulkMsg('Update failed'); }
    setApplying(false);
  };

  const USPS_TRACK = 'https://tools.usps.com/go/TrackConfirmAction?tLabels=';
  const CHUNK = 35;

  const trackAll = () => {
    const ids = labels.map(l => l.trackingId).filter(Boolean);
    if (!ids.length) return;
    window.open(`${USPS_TRACK}${ids.join(',')}&tABt=true`, '_blank', 'noopener,noreferrer');
  };

  const masterTrack = async () => {
    setMasterTracking(true);
    setTrackMsg('');
    try {
      const p: Record<string, string> = {};
      if (search)           p.search         = search;
      if (tsFilter.length)  p.trackingStatus = tsFilter.join(',');
      if (vendorId)         p.vendorId       = vendorId;
      if (userId)   p.userId         = userId;
      if (dateFrom) p.dateFrom       = dateFrom;
      if (dateTo)   p.dateTo         = dateTo;
      const res = await axios.get(`${API_BASE}/labels/tracking-ids`, { headers: authH(), params: p });
      const ids: string[] = res.data.ids || [];
      if (!ids.length) { setTrackMsg('No tracking IDs found for current filters'); setMasterTracking(false); return; }
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      const ok = window.confirm(`Open ${chunks.length} tab(s) to track ${ids.length} labels (${CHUNK} per tab)?`);
      if (!ok) { setMasterTracking(false); return; }
      let blocked = 0;
      chunks.forEach(chunk => {
        const win = window.open(`${USPS_TRACK}${chunk.join(',')}&tABt=true`, '_blank', 'noopener,noreferrer');
        if (!win || win.closed) blocked++;
      });
      if (blocked > 0) {
        setTrackMsg(`${blocked} tab(s) blocked — allow popups for this site and retry`);
      } else {
        setTrackMsg(`Opened ${chunks.length} tracking tab${chunks.length > 1 ? 's' : ''}`);
        setTimeout(() => setTrackMsg(''), 4000);
      }
    } catch { setTrackMsg('Failed to fetch tracking IDs — try again'); }
    setMasterTracking(false);
  };

  const clearFilters = () => { setSearch(''); setTsFilter([]); setVendorId(''); setUserId(''); setDateFrom(''); setDateTo(''); setPage(1); };

  const hasFilters = search || tsFilter.length || vendorId || userId || dateFrom || dateTo;

  const inp: React.CSSProperties = { height: 34, padding: '0 0.7rem', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.8rem', fontFamily: FONT, outline: 'none', boxSizing: 'border-box' };
  const sel: React.CSSProperties = { ...inp, cursor: 'pointer', paddingRight: '1.8rem', appearance: 'none' as const };

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>All Labels</h1>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99 }}>
              {total.toLocaleString()} total
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>All users · single + bulk labels</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Track All — current page only, 1 tab */}
            <button onClick={trackAll} disabled={labels.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.9rem', borderRadius: 8, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', color: 'var(--navy-700)', fontSize: '0.8rem', fontWeight: 600, cursor: labels.length > 0 ? 'pointer' : 'not-allowed', fontFamily: FONT, opacity: labels.length === 0 ? 0.5 : 1 }}>
              <SignalIcon style={{ width: 14, height: 14 }} />
              Track All ({labels.filter(l => l.trackingId).length})
            </button>

            {/* Track All Pages — all matching labels, N tabs */}
            <button onClick={masterTrack} disabled={masterTracking || total === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.9rem', borderRadius: 8, background: total > 0 ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'var(--navy-200)', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: (!masterTracking && total > 0) ? 'pointer' : 'not-allowed', fontFamily: FONT, opacity: total === 0 ? 0.5 : 1 }}>
              {masterTracking
                ? <><ArrowPathIcon style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Loading…</>
                : <><SignalIcon style={{ width: 14, height: 14 }} /> Track All Pages ({total.toLocaleString()})</>
              }
            </button>

            <button onClick={fetchLabels} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.9rem', borderRadius: 8, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', color: 'var(--navy-600)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              <ArrowPathIcon style={{ width: 14, height: 14 }} /> Refresh
            </button>
          </div>
          {trackMsg && (
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: trackMsg.includes('block') || trackMsg.includes('fail') || trackMsg.includes('No') ? '#DC2626' : '#15803D', fontFamily: FONT }}>
              {trackMsg}
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────── */}
      <div className="db-card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flexGrow: 1, minWidth: 200 }}>
            <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)' }} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search tracking ID, name, city…"
              style={{ ...inp, paddingLeft: 30, width: '100%' }}
            />
          </div>

          {/* Status — multi-select */}
          <div style={{ position: 'relative' }}>
            {tsDropOpen && <div onClick={() => setTsDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />}
            <button
              onClick={() => setTsDropOpen(o => !o)}
              style={{ ...inp, display: 'flex', alignItems: 'center', gap: 6, minWidth: 160, cursor: 'pointer', paddingRight: '1.8rem' }}
            >
              {tsFilter.length === 0
                ? <span style={{ color: 'var(--navy-400)' }}>All Statuses</span>
                : tsFilter.length === 1
                  ? <span style={{ color: TS_CFG[tsFilter[0]]?.color || 'var(--navy-700)', fontWeight: 600, fontSize: '0.75rem' }}>{TS_CFG[tsFilter[0]]?.label}</span>
                  : <span style={{ color: '#6366f1', fontWeight: 700, fontSize: '0.75rem' }}>{tsFilter.length} selected</span>
              }
              <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--navy-400)' }} width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
            </button>
            {tsDropOpen && (
              <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', minWidth: 210, padding: '6px 0', overflow: 'hidden' }}>
                {tsFilter.length > 0 && (
                  <button onClick={() => { setTsFilter([]); setPage(1); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', fontFamily: FONT }}>
                    Clear selection
                  </button>
                )}
                {TS_KEYS.map(k => {
                  const cfg = TS_CFG[k];
                  const active = tsFilter.includes(k);
                  return (
                    <button key={k} onClick={() => {
                      setTsFilter(prev => active ? prev.filter(x => x !== k) : [...prev, k]);
                      setPage(1);
                    }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 12px', background: active ? `${cfg.bg}` : 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${active ? cfg.color : 'var(--navy-300)'}`, background: active ? cfg.color : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {active && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: active ? 700 : 400, color: active ? cfg.color : 'var(--navy-700)' }}>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vendor */}
          <div style={{ position: 'relative' }}>
            <select value={vendorId} onChange={e => { setVendorId(e.target.value); setPage(1); }} style={{ ...sel, minWidth: 140 }}>
              <option value="">All Vendors</option>
              {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select>
            <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--navy-400)' }} width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
          </div>

          {/* User */}
          <div style={{ position: 'relative' }}>
            <select value={userId} onChange={e => { setUserId(e.target.value); setPage(1); }} style={{ ...sel, minWidth: 140 }}>
              <option value="">All Users</option>
              {users.map(u => <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>)}
            </select>
            <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--navy-400)' }} width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
          </div>

          {/* Date from/to */}
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={{ ...inp, width: 138 }} />
          <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPage(1); }} style={{ ...inp, width: 138 }} />

          {hasFilters && (
            <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 0.75rem', height: 34, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              <XMarkIcon style={{ width: 13, height: 13 }} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk action bar ────────────────────────────────────── */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem', background: 'rgba(99,102,241,0.07)', border: '1.5px solid rgba(99,102,241,0.2)', borderRadius: 10, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6366f1', fontFamily: FONT }}>{selected.size} selected</span>
          <div style={{ position: 'relative' }}>
            <select value={bulkTs} onChange={e => setBulkTs(e.target.value)} style={{ ...sel, minWidth: 180, borderColor: 'rgba(99,102,241,0.3)', background: 'white' }}>
              <option value="">Choose new status…</option>
              {TS_KEYS.map(k => <option key={k} value={k}>{TS_CFG[k].label}</option>)}
            </select>
            <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--navy-400)' }} width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
          </div>
          <button
            onClick={applyBulk}
            disabled={!bulkTs || applying}
            style={{ padding: '0 1rem', height: 34, borderRadius: 8, background: bulkTs ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'var(--navy-200)', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: bulkTs ? 'pointer' : 'not-allowed', fontFamily: FONT }}
          >
            {applying ? 'Applying…' : `Apply to ${selected.size}`}
          </button>
          <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '0.78rem', fontFamily: FONT }}>Cancel</button>
          {bulkMsg && (
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: bulkMsg.includes('fail') ? '#ef4444' : '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircleIcon style={{ width: 13, height: 13 }} /> {bulkMsg}
            </span>
          )}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT }}>
            <thead>
              <tr style={{ background: 'var(--navy-50)', borderBottom: '1.5px solid var(--navy-200)' }}>
                <th style={{ padding: '8px 10px', width: 36 }}>
                  <input type="checkbox" checked={selected.size === labels.length && labels.length > 0} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                {['Tracking ID', 'Type', 'Portal', 'Vendor', 'From', 'To', 'Wt', 'Status', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.63rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} style={{ padding: '10px' }}>
                        <div style={{ height: 10, borderRadius: 5, background: 'var(--navy-100)', animation: 'bl-shimmer 1.5s infinite', backgroundSize: '200% 100%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : labels.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem' }}>
                    No labels found{hasFilters ? ' — try adjusting your filters' : ''}
                  </td>
                </tr>
              ) : (
                labels.map(l => (
                  <tr key={l._id} style={{ borderBottom: '1px solid var(--navy-100)', background: selected.has(l._id) ? 'rgba(99,102,241,0.04)' : 'transparent', transition: 'background 0.1s' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <input type="checkbox" checked={selected.has(l._id)} onChange={() => toggleSelect(l._id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--navy-700)', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.trackingId || <span style={{ color: 'var(--navy-300)', fontStyle: 'italic' }}>pending…</span>}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: '0.63rem', fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: l.isBulk ? 'rgba(99,102,241,0.1)' : 'rgba(34,197,94,0.1)', color: l.isBulk ? '#6366f1' : '#15803d', border: `1px solid ${l.isBulk ? 'rgba(99,102,241,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
                        {l.isBulk ? 'Bulk' : 'Single'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <PortalBadge source={l.vendor?.source} />
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--navy-700)', whiteSpace: 'nowrap', fontSize: '0.76rem' }}>{l.vendorName || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--navy-600)', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--navy-800)' }}>{l.from_name}</div>
                      <div style={{ color: 'var(--navy-400)', fontSize: '0.68rem' }}>{l.from_city}, {l.from_state}</div>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--navy-600)', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--navy-800)' }}>{l.to_name}</div>
                      <div style={{ color: 'var(--navy-400)', fontSize: '0.68rem' }}>{l.to_city}, {l.to_state}</div>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--navy-600)', whiteSpace: 'nowrap' }}>{l.weight} lbs</td>
                    <td style={{ padding: '8px 10px' }}>
                      <StatusCell label={l} onUpdate={onUpdate} />
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--navy-400)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{timeAgo(l.createdAt)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <a href={getTrackUrl(l.carrier, l.trackingId)} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', padding: 5, borderRadius: 6, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', color: 'var(--navy-500)' }}>
                          <ArrowTopRightOnSquareIcon style={{ width: 13, height: 13 }} />
                        </a>
                        <button onClick={() => setHistLabel(l)} style={{ display: 'flex', padding: 5, borderRadius: 6, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', color: 'var(--navy-500)', cursor: 'pointer' }}>
                          <ClockIcon style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--navy-400)' }}>Page {page} of {totalPages} · {total.toLocaleString()} total</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)', cursor: page > 1 ? 'pointer' : 'not-allowed', color: page > 1 ? 'var(--navy-700)' : 'var(--navy-300)' }}>
              <ChevronLeftIcon style={{ width: 14, height: 14 }} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              return (
                <button key={p} onClick={() => setPage(p)} style={{ padding: '0.4rem 0.7rem', borderRadius: 7, border: `1.5px solid ${p === page ? '#6366f1' : 'var(--navy-200)'}`, background: p === page ? '#6366f1' : 'var(--bg-card)', color: p === page ? '#fff' : 'var(--navy-700)', fontSize: '0.8rem', fontWeight: p === page ? 700 : 400, cursor: 'pointer', fontFamily: FONT }}>
                  {p}
                </button>
              );
            })}
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)', cursor: page < totalPages ? 'pointer' : 'not-allowed', color: page < totalPages ? 'var(--navy-700)' : 'var(--navy-300)' }}>
              <ChevronRightIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      {/* History modal */}
      {histLabel && <HistoryModal label={histLabel} onClose={() => setHistLabel(null)} />}
    </div>
  );
}
