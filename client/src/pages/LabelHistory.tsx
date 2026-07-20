import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  MagnifyingGlassIcon, TruckIcon, ArrowDownTrayIcon, XMarkIcon,
  EyeIcon, ArrowUturnLeftIcon, TagIcon, CalendarDaysIcon,
  ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const FONT   = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API    = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

// ── Tracking status ────────────────────────────────────────────────────────────
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
  if (ts === 'return_to_sender') return 'returned_to_sender';
  if (ts === 'void') return 'voided';
  return TS_CFG[ts] ? ts : 'not_scanned_yet';
}

// ── Carrier theme ──────────────────────────────────────────────────────────────
const CC: Record<string, { bg: string; color: string; border: string; accent: string }> = {
  USPS:  { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', accent: '#3B82F6' },
  UPS:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', accent: '#F59E0B' },
  FedEx: { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE', accent: '#7C3AED' },
  DHL:   { bg: '#FEF3C7', color: '#78350F', border: '#FDE68A', accent: '#D97706' },
};
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'];

function getTrackUrl(carrier: string, id: string) {
  const enc = encodeURIComponent(id);
  if (carrier === 'UPS')   return `https://www.ups.com/track?tracknum=${enc}`;
  if (carrier === 'FedEx') return `https://www.fedex.com/fedextrack/?trknbr=${enc}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc}`;
}

async function fetchLabelPdf(labelId: string) {
  try {
    const res = await axios.get(`${API}/labels/${labelId}/pdf`, { responseType: 'blob' });
    return window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  } catch { return null; }
}

async function downloadLabelPdf(labelId: string, trackingId: string) {
  const url = await fetchLabelPdf(labelId);
  if (!url) return;
  const a = document.createElement('a');
  a.href = url; a.download = `label-${trackingId || labelId}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface Label {
  _id: string; carrier: string; vendorName: string; shippingService: string;
  trackingId: string; isBulk: boolean;
  from_name: string; from_city: string; from_state: string;
  from_address1?: string; from_address2?: string; from_zip?: string;
  from_company?: string; from_phone?: string;
  to_name: string; to_city: string; to_state: string;
  to_address1?: string; to_address2?: string; to_zip?: string;
  to_company?: string; to_phone?: string;
  weight: number; length?: number; width?: number; height?: number; note?: string;
  price: number; status: string; trackingStatus?: string;
  trackingStatusHistory?: any[];
  pdfUrl?: string; bulkJobId?: string;
  createdAt: string;
  vendor?: { _id: string };
  user?: { firstName: string; lastName: string; email: string };
}
interface Vendor { _id: string; name: string; carrier: string; }

// ── PDF modal ──────────────────────────────────────────────────────────────────
const PdfModal: React.FC<{ url: string; trackingId: string; onClose: () => void }> = ({ url, trackingId, onClose }) => (
  <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,6,23,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', backdropFilter: 'blur(4px)' }}>
    <div style={{ background: 'var(--bg-card)', borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 740, height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.125rem', borderBottom: '1px solid var(--navy-200)', background: 'var(--navy-50)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EyeIcon style={{ width: 14, height: 14, color: '#fff' }} />
          </div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)', fontFamily: FONT }}>Label Preview</div>
          {trackingId && <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'var(--navy-500)' }}>{trackingId}</div>}
        </div>
        <button onClick={onClose} style={{ width: 30, height: 30, border: 'none', borderRadius: 7, background: 'var(--navy-100)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-500)' }}>
          <XMarkIcon style={{ width: 15, height: 15 }} />
        </button>
      </div>
      <iframe src={url} title="Label PDF" style={{ flex: 1, border: 'none', width: '100%' }} />
    </div>
  </div>
);

// ── Skeleton ───────────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr style={{ borderBottom: '1px solid var(--navy-100)' }}>
    {[40, 60, 170, 160, 160, 70, 80, 140].map((w, i) => (
      <td key={i} style={{ padding: '0.9rem 0.875rem' }}>
        <div style={{ height: 10, width: w, borderRadius: 5, background: 'linear-gradient(90deg,var(--navy-100) 25%,var(--navy-200) 50%,var(--navy-100) 75%)', backgroundSize: '200% 100%', animation: 'alh-shimmer 1.4s infinite' }} />
      </td>
    ))}
    <td style={{ padding: '0.9rem 0.875rem' }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {[52, 44, 30].map((w, i) => <div key={i} style={{ height: 28, width: w, borderRadius: 7, background: 'var(--navy-100)' }} />)}
      </div>
    </td>
  </tr>
);

// ── Main ───────────────────────────────────────────────────────────────────────
const AllLabelHistory: React.FC = () => {
  const navigate         = useNavigate();
  const { user: authUser } = useAuth();
  const isAdmin          = authUser?.role === 'admin';
  const token            = localStorage.getItem('token');
  const authH            = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [labels,       setLabels]       = useState<Label[]>([]);
  const [vendors,      setVendors]       = useState<Vendor[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [isLoading,    setIsLoading]    = useState(true);

  // Filters
  const [search,       setSearch]       = useState('');
  const [carrierF,     setCarrierF]     = useState('');
  const [typeF,        setTypeF]        = useState('');          // '' | 'false' | 'true'
  const [tsFilter,     setTsFilter]     = useState<string[]>([]); // tracking status multi
  const [tsDropOpen,   setTsDropOpen]   = useState(false);
  const [vendorF,      setVendorF]      = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [showDate,     setShowDate]     = useState(false);

  // UI
  const [viewPdf,      setViewPdf]      = useState<{ url: string; trackingId: string } | null>(null);
  const [openAction,   setOpenAction]   = useState<string | null>(null);
  const [voidingId,    setVoidingId]    = useState<string | null>(null);

  // Load vendors for admin filter
  useEffect(() => {
    if (!isAdmin) return;
    axios.get(`${API}/vendors`, { headers: authH() })
      .then(r => setVendors(r.data.vendors || []))
      .catch(() => {});
  }, [isAdmin, authH]);

  const fetchLabels = useCallback(async () => {
    setIsLoading(true);
    try {
      const p: Record<string, string> = { page: String(page), limit: '35' };
      if (carrierF)         p.carrier       = carrierF;
      if (typeF)            p.isBulk        = typeF;
      if (tsFilter.length)  p.trackingStatus = tsFilter.join(',');
      if (vendorF)          p.vendor        = vendorF;
      if (dateFrom)         p.dateFrom      = dateFrom;
      if (dateTo)           p.dateTo        = dateTo;
      if (search)           p.search        = search;
      const res = await axios.get(`${API}/labels/all-history`, { headers: authH(), params: p });
      setLabels(res.data.labels || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, [page, carrierF, typeF, tsFilter, vendorF, dateFrom, dateTo, search, authH]);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  // Close action menus on outside click
  useEffect(() => {
    const h = () => setOpenAction(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const reset = () => {
    setCarrierF(''); setTypeF(''); setTsFilter([]); setVendorF('');
    setDateFrom(''); setDateTo(''); setSearch(''); setPage(1); setShowDate(false);
  };

  const hasFilters = !!(carrierF || typeF || tsFilter.length || vendorF || dateFrom || dateTo || search);
  const totalSpent = labels.reduce((s, l) => s + (l.price || 0), 0);

  const pageNums = (() => {
    const delta = 2, range: number[] = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) range.push(i);
    if (range[0] > 1)                         { range.unshift(-1); range.unshift(1); }
    if (range[range.length - 1] < totalPages) { range.push(-2); range.push(totalPages); }
    return range;
  })();

  const handleReturn = (label: Label) => {
    navigate('/labels/single', {
      state: { prefill: {
        carrier: label.carrier, vendorId: label.vendor?._id ?? '',
        from_name: label.to_name, from_company: label.to_company ?? '',
        from_phone: label.to_phone ?? '', from_address1: label.to_address1 ?? '',
        from_address2: label.to_address2 ?? '', from_city: label.to_city,
        from_state: label.to_state, from_zip: label.to_zip ?? '',
        to_name: label.from_name, to_company: label.from_company ?? '',
        to_phone: label.from_phone ?? '', to_address1: label.from_address1 ?? '',
        to_address2: label.from_address2 ?? '', to_city: label.from_city,
        to_state: label.from_state, to_zip: label.from_zip ?? '',
        weight: String(label.weight ?? ''), length: String(label.length ?? ''),
        width: String(label.width ?? ''), height: String(label.height ?? ''),
        note: label.note ?? '',
      }},
    });
  };

  const handleVoid = async (labelId: string) => {
    setVoidingId(labelId);
    try {
      const res = await axios.patch(`${API}/labels/${labelId}/void`, {}, { headers: authH() });
      setLabels(prev => prev.map(l => l._id === labelId ? { ...l, trackingStatus: res.data.trackingStatus } : l));
    } catch {}
    setVoidingId(null);
  };

  const handleUpdateTs = async (labelId: string, ts: string) => {
    setLabels(prev => prev.map(l => l._id === labelId ? { ...l, trackingStatus: ts } : l));
    try {
      await axios.patch(`${API}/labels/${labelId}/tracking-status`, { trackingStatus: ts }, { headers: authH() });
    } catch {}
  };

  const openPdf = async (label: Label) => {
    const url = await fetchLabelPdf(label._id);
    if (url) setViewPdf({ url, trackingId: label.trackingId });
  };

  const TYPE_TABS = [
    { key: '',      label: 'All Types' },
    { key: 'false', label: 'Single' },
    { key: 'true',  label: 'Bulk' },
  ];

  return (
    <>
      <style>{`
        @keyframes alh-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontFamily: FONT }}>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg,#0F172A 0%,#1E293B 58%,#1e3a8a 100%)',
          borderRadius: 18, padding: '1.25rem 1.8rem', position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '-40%', right: '6%', width: 210, height: 210, background: 'radial-gradient(circle,rgba(99,102,241,0.13) 0%,transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TagIcon style={{ width: 22, height: 22, color: '#818CF8' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', fontFamily: FONT }}>Label History</h1>
              <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'rgba(148,163,184,0.65)', fontFamily: FONT }}>All labels — single &amp; bulk — in one place</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Labels', value: isLoading ? '—' : total.toLocaleString(), accent: '#818CF8' },
              { label: 'Page Spend',   value: isLoading ? '—' : `$${totalSpent.toFixed(2)}`, accent: '#34D399' },
              { label: 'Page',         value: isLoading ? '—' : `${page} / ${totalPages}`, accent: 'rgba(255,255,255,0.45)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.42rem 0.8rem', minWidth: 72 }}>
                <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontFamily: FONT }}>{s.label}</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: s.accent, letterSpacing: '-0.02em', fontFamily: FONT, marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        <div className="db-card" style={{ overflow: 'hidden' }}>

          {/* Row 1: Search + admin filters + date + clear */}
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--navy-100)', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)', pointerEvents: 'none' }} />
              <input
                type="text" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search tracking ID, name…"
                style={{ width: '100%', boxSizing: 'border-box', height: 36, paddingLeft: 32, paddingRight: 10, border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--navy-800)', outline: 'none', background: 'var(--bg-card)', fontFamily: FONT, transition: 'border-color 0.15s' }}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = 'var(--navy-200)')}
              />
            </div>

            {/* Tracking status multi-select */}
            <div style={{ position: 'relative' }}>
              {tsDropOpen && <div onClick={() => setTsDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />}
              <button
                onClick={() => setTsDropOpen(o => !o)}
                style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', paddingRight: 28, border: `1.5px solid ${tsFilter.length ? '#6366f1' : 'var(--navy-200)'}`, borderRadius: 8, background: tsFilter.length ? '#EEF2FF' : 'var(--bg-card)', color: tsFilter.length ? '#4F46E5' : 'var(--navy-600)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap', transition: 'all 0.15s', position: 'relative' }}
              >
                <FunnelIcon style={{ width: 13, height: 13 }} />
                {tsFilter.length === 0 ? 'Status' : tsFilter.length === 1 ? TS_CFG[tsFilter[0]]?.label : `${tsFilter.length} statuses`}
              </button>
              {tsDropOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', minWidth: 210, padding: '6px 0', overflow: 'hidden' }}>
                  {tsFilter.length > 0 && (
                    <button onClick={() => { setTsFilter([]); setPage(1); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', fontFamily: FONT }}>
                      Clear selection
                    </button>
                  )}
                  {TS_KEYS.map(k => {
                    const cfg = TS_CFG[k]; const active = tsFilter.includes(k);
                    return (
                      <button key={k} onClick={() => { setTsFilter(p => active ? p.filter(x => x !== k) : [...p, k]); setPage(1); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: active ? cfg.bg : 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                        <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${active ? cfg.color : 'var(--navy-300)'}`, background: active ? cfg.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {active && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: active ? 700 : 400, color: active ? cfg.color : 'var(--navy-700)' }}>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Vendor (admin only) */}
            {isAdmin && vendors.length > 0 && (
              <select value={vendorF} onChange={e => { setVendorF(e.target.value); setPage(1); }}
                style={{ height: 36, paddingLeft: 10, paddingRight: 28, border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--bg-card)', cursor: 'pointer', outline: 'none', appearance: 'none' as const, fontFamily: FONT, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394A3B8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 16 }}>
                <option value="">All Vendors</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            )}

            {/* Date toggle */}
            <button onClick={() => setShowDate(o => !o)}
              style={{ height: 36, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: `1.5px solid ${showDate || dateFrom || dateTo ? '#6366f1' : 'var(--navy-200)'}`, borderRadius: 8, background: showDate || dateFrom || dateTo ? '#EEF2FF' : 'var(--bg-card)', color: showDate || dateFrom || dateTo ? '#4F46E5' : 'var(--navy-500)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              <CalendarDaysIcon style={{ width: 13, height: 13 }} />
              Date
              {(dateFrom || dateTo) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />}
            </button>

            {hasFilters && (
              <button onClick={reset}
                style={{ height: 36, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: '1.5px solid #FCA5A5', borderRadius: 8, background: '#FFF5F5', color: '#DC2626', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                <XMarkIcon style={{ width: 12, height: 12 }} /> Clear
              </button>
            )}
          </div>

          {/* Row 2: Carrier tabs + Type tabs */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.875rem', borderBottom: showDate ? '1px solid var(--navy-100)' : 'none', overflowX: 'auto' }}>
            {/* Carrier */}
            {['', ...CARRIERS].map(c => {
              const active = carrierF === c; const theme = c ? CC[c] : null;
              return (
                <button key={c || 'all'} onClick={() => { setCarrierF(c); setVendorF(''); setPage(1); }}
                  style={{ padding: '0.5rem 0.875rem', border: 'none', background: 'transparent', fontSize: '0.75rem', fontWeight: active ? 700 : 500, fontFamily: FONT, color: active ? (theme?.color ?? '#4F46E5') : 'var(--navy-500)', borderBottom: `2px solid ${active ? (theme?.accent ?? '#6366f1') : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', marginBottom: -1 }}>
                  {c || 'All Carriers'}
                </button>
              );
            })}

            <div style={{ width: 1, height: 18, background: 'var(--navy-200)', margin: '0 6px', flexShrink: 0 }} />

            {/* Type */}
            {TYPE_TABS.map(t => {
              const active = typeF === t.key;
              return (
                <button key={t.key || 'all-type'} onClick={() => { setTypeF(t.key); setPage(1); }}
                  style={{ padding: '0.5rem 0.75rem', border: 'none', background: 'transparent', fontSize: '0.75rem', fontWeight: active ? 700 : 500, fontFamily: FONT, color: active ? '#6366f1' : 'var(--navy-500)', borderBottom: `2px solid ${active ? '#6366f1' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', marginBottom: -1 }}>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Date range */}
          {showDate && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.625rem 0.875rem', background: 'var(--navy-50)' }}>
              <CalendarDaysIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)', fontFamily: FONT }}>From</label>
              <input type="date" value={dateFrom} max={dateTo || undefined}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                style={{ height: 32, padding: '0 8px', border: '1.5px solid var(--navy-200)', borderRadius: 7, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none', fontFamily: FONT }} />
              <ArrowRightIcon style={{ width: 12, height: 12, color: 'var(--navy-300)' }} />
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)', fontFamily: FONT }}>To</label>
              <input type="date" value={dateTo} min={dateFrom || undefined}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                style={{ height: 32, padding: '0 8px', border: '1.5px solid var(--navy-200)', borderRadius: 7, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none', fontFamily: FONT }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex', padding: 2 }}>
                  <XMarkIcon style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="db-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--navy-50)' }}>
                  {['#', 'Type', 'Tracking & Carrier', 'Recipient', 'Sender', 'Price', 'Date', 'Tracking Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.65rem 0.875rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', borderBottom: '1.5px solid var(--navy-200)', fontFamily: FONT }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : labels.length === 0
                  ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '4rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TagIcon style={{ width: 26, height: 26, color: 'var(--navy-300)' }} />
                          </div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>No labels found</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', fontFamily: FONT }}>
                            {hasFilters ? 'Try adjusting your filters.' : 'Labels you generate will appear here.'}
                          </div>
                          {hasFilters && (
                            <button onClick={reset} style={{ marginTop: 4, padding: '6px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                              Clear Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                  : labels.map((label, idx) => {
                    const theme      = CC[label.carrier] ?? { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', accent: '#94A3B8' };
                    const ts         = resolveTs(label.trackingStatus);
                    const tsCfg      = TS_CFG[ts];
                    const rowNum     = (page - 1) * 35 + idx + 1;
                    const isMenuOpen = openAction === label._id;
                    const isVoided   = ts === 'voided';

                    return (
                      <tr key={label._id}
                        style={{ borderBottom: '1px solid var(--navy-100)', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                        {/* # */}
                        <td style={{ padding: '0.875rem 0.875rem 0.875rem 1rem', width: 40 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 3, height: 34, borderRadius: 2, background: theme.accent, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.68rem', color: 'var(--navy-300)', fontWeight: 700, fontFamily: FONT }}>{String(rowNum).padStart(2, '0')}</span>
                          </div>
                        </td>

                        {/* Type badge */}
                        <td style={{ padding: '0.875rem 0.875rem', whiteSpace: 'nowrap' }}>
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                            background: label.isBulk ? 'rgba(99,102,241,0.1)' : 'rgba(34,197,94,0.1)',
                            color: label.isBulk ? '#6366f1' : '#15803d',
                            border: `1px solid ${label.isBulk ? 'rgba(99,102,241,0.25)' : 'rgba(34,197,94,0.25)'}`,
                            fontFamily: FONT,
                          }}>
                            {label.isBulk ? 'Bulk' : 'Single'}
                          </span>
                        </td>

                        {/* Tracking & Carrier */}
                        <td style={{ padding: '0.875rem 0.875rem', minWidth: 175 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ background: theme.bg, color: theme.color, border: `1px solid ${theme.border}`, borderRadius: 5, padding: '2px 7px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em', fontFamily: FONT }}>
                              {label.carrier}
                            </span>
                            {label.status === 'generated' && <CheckCircleIcon style={{ width: 13, height: 13, color: '#22C55E', flexShrink: 0 }} />}
                          </div>
                          {label.trackingId
                            ? (
                              <a href={getTrackUrl(label.carrier, label.trackingId)} target="_blank" rel="noopener noreferrer"
                                style={{ fontFamily: 'monospace', fontSize: '0.73rem', color: 'var(--navy-800)', fontWeight: 600, textDecoration: 'none', display: 'block', maxWidth: 155, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                onMouseEnter={e => (e.currentTarget.style.color = theme.color)}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--navy-800)')}>
                                {label.trackingId}
                              </a>
                            )
                            : <span style={{ fontSize: '0.72rem', color: 'var(--navy-300)', fontFamily: FONT }}>No tracking ID</span>
                          }
                        </td>

                        {/* Recipient */}
                        <td style={{ padding: '0.875rem 0.875rem', minWidth: 150 }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150, fontFamily: FONT }}>{label.to_name}</div>
                          <div style={{ fontSize: '0.67rem', color: 'var(--navy-400)', marginTop: 1, fontFamily: FONT }}>{label.to_city}, {label.to_state}</div>
                          {label.to_zip && <div style={{ fontSize: '0.63rem', color: 'var(--navy-300)', fontFamily: 'monospace' }}>{label.to_zip}</div>}
                        </td>

                        {/* Sender */}
                        <td style={{ padding: '0.875rem 0.875rem', minWidth: 150 }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150, fontFamily: FONT }}>{label.from_name}</div>
                          <div style={{ fontSize: '0.67rem', color: 'var(--navy-400)', marginTop: 1, fontFamily: FONT }}>{label.from_city}, {label.from_state}</div>
                        </td>

                        {/* Price */}
                        <td style={{ padding: '0.875rem 0.875rem', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '3px 8px', display: 'inline-block', fontFamily: FONT }}>
                            ${(label.price ?? 0).toFixed(2)}
                          </span>
                        </td>

                        {/* Date */}
                        <td style={{ padding: '0.875rem 0.875rem', whiteSpace: 'nowrap', minWidth: 90 }}>
                          <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--navy-800)', fontFamily: FONT }}>
                            {new Date(label.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div style={{ fontSize: '0.66rem', color: 'var(--navy-400)', marginTop: 1, fontFamily: FONT }}>
                            {new Date(label.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        {/* Tracking Status */}
                        <td style={{ padding: '0.875rem 0.875rem', minWidth: 175 }}>
                          {isAdmin
                            ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <select value={ts} onChange={e => handleUpdateTs(label._id, e.target.value)}
                                  style={{ flex: 1, height: 28, paddingLeft: 7, paddingRight: 22, border: `1.5px solid ${tsCfg.border}`, borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, color: tsCfg.color, backgroundColor: tsCfg.bg, cursor: 'pointer', outline: 'none', appearance: 'none' as const, fontFamily: FONT, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394A3B8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center', backgroundSize: 13 }}>
                                  {TS_KEYS.map(k => <option key={k} value={k}>{TS_CFG[k].label}</option>)}
                                </select>
                                <button onClick={() => {}} title="View history"
                                  style={{ width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--navy-200)', borderRadius: 6, background: 'var(--bg-card)', color: 'var(--navy-400)', cursor: 'pointer', transition: 'all 0.15s' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.borderColor = 'var(--navy-200)'; e.currentTarget.style.color = 'var(--navy-400)'; }}>
                                  <ClockIcon style={{ width: 11, height: 11 }} />
                                </button>
                              </div>
                            )
                            : (
                              <span style={{ background: tsCfg.bg, color: tsCfg.color, border: `1px solid ${tsCfg.border}`, borderRadius: 20, padding: '3px 9px', fontSize: '0.65rem', fontWeight: 700, display: 'inline-block', whiteSpace: 'nowrap', fontFamily: FONT }}>
                                {tsCfg.label}
                              </span>
                            )
                          }
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '0.875rem 0.875rem', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

                            {/* Void — single labels only, not already voided */}
                            {!label.isBulk && !isVoided && (
                              <button onClick={() => handleVoid(label._id)} disabled={voidingId === label._id}
                                style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 9px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: '#F8FAFC', color: '#64748B', fontSize: '0.68rem', fontWeight: 700, cursor: voidingId === label._id ? 'not-allowed' : 'pointer', opacity: voidingId === label._id ? 0.6 : 1, transition: 'all 0.15s', fontFamily: FONT }}
                                onMouseEnter={e => { if (voidingId !== label._id) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#94A3B8'; } }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}>
                                {voidingId === label._id ? '…' : '∅ Void'}
                              </button>
                            )}

                            {/* Return — single labels only */}
                            {!label.isBulk && (
                              <button onClick={() => handleReturn(label)} title="Return label"
                                style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 9px', border: '1.5px solid #E0E7FF', borderRadius: 7, background: '#EEF2FF', color: '#4F46E5', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', fontFamily: FONT }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#E0E7FF'; e.currentTarget.style.borderColor = '#6366F1'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#E0E7FF'; }}>
                                <ArrowUturnLeftIcon style={{ width: 11, height: 11 }} />
                                Return
                              </button>
                            )}

                            {/* Track */}
                            {label.trackingId && (
                              <a href={getTrackUrl(label.carrier, label.trackingId)} target="_blank" rel="noopener noreferrer"
                                style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 9px', border: `1.5px solid ${theme.border}`, borderRadius: 7, background: theme.bg, color: theme.color, fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', transition: 'filter 0.15s', fontFamily: FONT }}
                                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.93)')}
                                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>
                                <TruckIcon style={{ width: 11, height: 11 }} />
                                Track
                              </a>
                            )}

                            {/* PDF — single labels only */}
                            {!label.isBulk && label.pdfUrl && (
                              <div style={{ position: 'relative' }}>
                                <button onClick={e => { e.stopPropagation(); setOpenAction(isMenuOpen ? null : label._id); }} title="PDF options"
                                  style={{ height: 30, width: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--navy-200)', borderRadius: 7, background: isMenuOpen ? 'var(--navy-100)' : 'var(--bg-card)', color: 'var(--navy-500)', cursor: 'pointer', transition: 'all 0.15s' }}>
                                  <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
                                </button>
                                {isMenuOpen && (
                                  <div onClick={e => e.stopPropagation()}
                                    style={{ position: 'absolute', right: 0, top: 'calc(100% + 5px)', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 100, minWidth: 150, overflow: 'hidden' }}>
                                    <button onClick={() => { openPdf(label); setOpenAction(null); }}
                                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 0.875rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--navy-800)', fontWeight: 600, textAlign: 'left', fontFamily: FONT }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                      <EyeIcon style={{ width: 14, height: 14, color: 'var(--navy-500)', flexShrink: 0 }} />
                                      View PDF
                                    </button>
                                    <div style={{ height: 1, background: 'var(--navy-100)', margin: '0 0.625rem' }} />
                                    <button onClick={() => { downloadLabelPdf(label._id, label.trackingId); setOpenAction(null); }}
                                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 0.875rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--navy-800)', fontWeight: 600, textAlign: 'left', fontFamily: FONT }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                      <ArrowDownTrayIcon style={{ width: 14, height: 14, color: 'var(--navy-500)', flexShrink: 0 }} />
                                      Download PDF
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid var(--navy-100)', background: 'var(--navy-50)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontFamily: FONT }}>
                Showing {(page - 1) * 35 + 1}–{Math.min(page * 35, total)} of <strong style={{ color: 'var(--navy-600)' }}>{total}</strong> labels
              </span>
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--navy-200)', borderRadius: 7, background: page <= 1 ? 'var(--navy-50)' : 'var(--bg-card)', color: page <= 1 ? 'var(--navy-300)' : 'var(--navy-600)', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
                  <ChevronLeftIcon style={{ width: 13, height: 13 }} />
                </button>
                {pageNums.map(n =>
                  n < 0
                    ? <span key={`e${n}`} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--navy-300)', fontFamily: FONT }}>…</span>
                    : <button key={n} onClick={() => setPage(n)}
                        style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${n === page ? '#6366f1' : 'var(--navy-200)'}`, borderRadius: 7, background: n === page ? '#6366f1' : 'var(--bg-card)', color: n === page ? '#fff' : 'var(--navy-600)', fontSize: '0.75rem', fontWeight: n === page ? 700 : 500, cursor: 'pointer', fontFamily: FONT }}>
                        {n}
                      </button>
                )}
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--navy-200)', borderRadius: 7, background: page >= totalPages ? 'var(--navy-50)' : 'var(--bg-card)', color: page >= totalPages ? 'var(--navy-300)' : 'var(--navy-600)', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
                  <ChevronRightIcon style={{ width: 13, height: 13 }} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewPdf && <PdfModal url={viewPdf.url} trackingId={viewPdf.trackingId} onClose={() => setViewPdf(null)} />}
    </>
  );
};

export default AllLabelHistory;
