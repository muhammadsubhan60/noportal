import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  MagnifyingGlassIcon, TruckIcon, ArrowDownTrayIcon,
  XMarkIcon, EyeIcon, ArrowUturnLeftIcon, FunnelIcon,
  TagIcon, CurrencyDollarIcon, CalendarDaysIcon,
  ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// ── Tracking status config ────────────────────────────────────
const TS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  not_scanned_yet:   { label: 'Not Scanned Yet',    bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  in_transit:        { label: 'In Transit',          bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  out_for_delivery:  { label: 'Out for Delivery',    bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  delivered:         { label: 'Delivered',           bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  exception_problem: { label: 'Exception / Problem', bg: '#FFF5F5', color: '#DC2626', border: '#FECACA' },
  returned_to_sender:{ label: 'Returned to Sender',  bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
  pending_pickup:    { label: 'Pending Pickup',      bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  delayed:           { label: 'Delayed',             bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
};
const TS_OPTIONS = Object.keys(TS_CONFIG);

// Resolve legacy values stored in DB before enum migration
function resolveTs(ts?: string): string {
  if (!ts || ts === 'not_scanned') return 'not_scanned_yet';
  if (ts === 'exception') return 'exception_problem';
  if (ts === 'return_to_sender') return 'returned_to_sender';
  return TS_CONFIG[ts] ? ts : 'not_scanned_yet';
}

// ── Types ─────────────────────────────────────────────────────
interface TrackingHistoryEntry {
  status: string; note?: string; updatedAt: string;
  updatedBy?: { firstName: string; lastName: string };
}
interface Label {
  _id: string; carrier: string; vendorName: string; shippingService: string;
  trackingId: string;
  from_name: string; from_city: string; from_state: string;
  from_address1?: string; from_address2?: string; from_zip?: string;
  from_company?: string; from_phone?: string;
  to_name: string; to_city: string; to_state: string;
  to_address1?: string; to_address2?: string; to_zip?: string;
  to_company?: string; to_phone?: string;
  weight: number; length?: number; width?: number; height?: number; note?: string;
  price: number; status: string; trackingStatus?: string;
  trackingStatusHistory?: TrackingHistoryEntry[];
  pdfUrl?: string; isBulk: boolean; bulkJobId?: string;
  createdAt: string;
  vendor?: { _id: string };
  user?: { firstName: string; lastName: string; email: string };
}
interface Vendor { _id: string; name: string; carrier: string; }

// ── Helpers ───────────────────────────────────────────────────
function getTrackUrl(carrier: string, trackingId: string): string {
  const id = encodeURIComponent(trackingId);
  if (carrier === 'UPS')   return `https://www.ups.com/track?tracknum=${id}`;
  if (carrier === 'FedEx') return `https://www.fedex.com/fedextrack/?trknbr=${id}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${id}`;
}

// Fetch a label PDF via our own API proxy (avoids S3 CORS / auth header issues)
async function fetchLabelPdf(labelId: string): Promise<string | null> {
  try {
    const res = await axios.get(`/labels/${labelId}/pdf`, { responseType: 'blob' });
    return window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  } catch (e) {
    console.error('PDF fetch failed', e);
    return null;
  }
}

async function downloadLabelPdf(labelId: string, trackingId: string) {
  const blobUrl = await fetchLabelPdf(labelId);
  if (!blobUrl) return;
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `label-${trackingId || labelId}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

// ── Carrier theme ─────────────────────────────────────────────
const CC: Record<string, { bg: string; color: string; border: string; accent: string }> = {
  USPS:  { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', accent: '#3B82F6' },
  UPS:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', accent: '#F59E0B' },
  FedEx: { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE', accent: '#7C3AED' },
  DHL:   { bg: '#FEF3C7', color: '#78350F', border: '#FDE68A', accent: '#D97706' },
};

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'];

// ── PDF modal ─────────────────────────────────────────────────
const PdfModal: React.FC<{ url: string; trackingId: string; onClose: () => void }> = ({ url, trackingId, onClose }) => (
  <div
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,6,23,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', backdropFilter: 'blur(4px)' }}>
    <div style={{ background: 'var(--bg-card)', borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 740, height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.45)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.125rem', borderBottom: '1px solid var(--navy-200)', background: 'var(--navy-50)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EyeIcon style={{ width: 14, height: 14, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)' }}>Label Preview</div>
            {trackingId && <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'var(--navy-500)', marginTop: 1 }}>{trackingId}</div>}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--navy-100)', border: 'none', cursor: 'pointer', width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-500)', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-200)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--navy-100)')}>
          <XMarkIcon style={{ width: 15, height: 15 }} />
        </button>
      </div>
      <iframe src={url} title="Label PDF" style={{ flex: 1, border: 'none', width: '100%' }} />
    </div>
  </div>
);

// ── Status History Modal ──────────────────────────────────────
const StatusHistoryModal: React.FC<{
  label: Label;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (labelId: string, status: string, note: string) => Promise<void>;
}> = ({ label, isAdmin, onClose, onSave }) => {
  const [selStatus, setSelStatus] = React.useState(resolveTs(label.trackingStatus));
  const [note, setNote]           = React.useState('');
  const [saving, setSaving]       = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(label._id, selStatus, note);
    setSaving(false);
    onClose();
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(2,6,23,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-200)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClockIcon style={{ width: 15, height: 15, color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-900)' }}>Tracking Status</div>
              {label.trackingId && <div style={{ fontSize: '0.67rem', fontFamily: 'monospace', color: 'var(--navy-400)', marginTop: 1 }}>{label.trackingId}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: 'none', background: 'var(--navy-100)', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-500)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-200)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--navy-100)')}>
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Admin update form */}
          {isAdmin && (
            <div style={{ background: 'var(--navy-50)', borderRadius: 10, padding: '0.875rem 1rem', border: '1px solid var(--navy-200)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Update Status</div>
              <select
                value={selStatus}
                onChange={e => setSelStatus(e.target.value)}
                style={{ width: '100%', height: 36, paddingLeft: 10, paddingRight: 28, border: `1.5px solid ${TS_CONFIG[selStatus]?.border ?? '#E2E8F0'}`, borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, color: TS_CONFIG[selStatus]?.color ?? '#475569', backgroundColor: TS_CONFIG[selStatus]?.bg ?? '#F8FAFC', outline: 'none', marginBottom: 8, cursor: 'pointer', appearance: 'none' as const }}>
                {TS_OPTIONS.map(k => <option key={k} value={k}>{TS_CONFIG[k].label}</option>)}
              </select>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note (optional)…"
                maxLength={500}
                rows={2}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px 10px', border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--navy-800)', outline: 'none', background: 'var(--bg-card)', fontFamily: 'inherit', lineHeight: 1.5 }}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = 'var(--navy-200)')}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ marginTop: 8, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 16px', background: saving ? '#94A3B8' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
                {saving ? 'Saving…' : 'Save Status'}
              </button>
            </div>
          )}

          {/* History timeline */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              History ({(label.trackingStatusHistory?.length ?? 0)})
            </div>
            {(!label.trackingStatusHistory || label.trackingStatusHistory.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--navy-400)', fontSize: '0.8rem' }}>No history yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {label.trackingStatusHistory.map((entry, i) => {
                  const ts = resolveTs(entry.status);
                  const cfg = TS_CONFIG[ts] ?? TS_CONFIG['not_scanned_yet'];
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, border: `2px solid ${cfg.border}`, flexShrink: 0 }} />
                        {i < (label.trackingStatusHistory!.length - 1) && <div style={{ width: 2, height: 22, background: 'var(--navy-100)', marginTop: 4 }} />}
                      </div>
                      <div style={{ flex: 1, paddingBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700 }}>{cfg.label}</span>
                          {i === 0 && <span style={{ fontSize: '0.62rem', background: '#EEF2FF', color: '#4F46E5', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>Latest</span>}
                        </div>
                        {entry.note && <div style={{ fontSize: '0.73rem', color: 'var(--navy-600)', marginTop: 3, lineHeight: 1.4 }}>"{entry.note}"</div>}
                        <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)', marginTop: 3 }}>
                          {new Date(entry.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {entry.updatedBy && ` · ${entry.updatedBy.firstName} ${entry.updatedBy.lastName}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Skeleton row ──────────────────────────────────────────────
const SkeletonRow = () => (
  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
    {[60, 180, 130, 130, 80, 60, 80, 110, 90].map((w, i) => (
      <td key={i} style={{ padding: '0.875rem 0.875rem' }}>
        <div style={{ height: 10, width: w, borderRadius: 5, background: 'linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
        {i === 1 && <div style={{ height: 8, width: 50, borderRadius: 4, background: '#F1F5F9', marginTop: 6 }} />}
      </td>
    ))}
    <td style={{ padding: '0.875rem 0.875rem' }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {[44, 56, 44].map((w, i) => <div key={i} style={{ height: 26, width: w, borderRadius: 6, background: '#F1F5F9' }} />)}
      </div>
    </td>
  </tr>
);

// ── Main component ────────────────────────────────────────────
const LabelHistory: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'admin';
  const [labels,     setLabels]     = useState<Label[]>([]);
  const [vendors,    setVendors]    = useState<Vendor[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading,  setIsLoading]  = useState(true);
  const [viewPdf,        setViewPdf]        = useState<{ url: string; trackingId: string } | null>(null);
  const [openAction,     setOpenAction]     = useState<string | null>(null);
  const [historyLabel,   setHistoryLabel]   = useState<Label | null>(null);

  // Filters
  const [search,   setSearch]   = useState('');
  const [carrierF, setCarrierF] = useState('');
  const [vendorF,  setVendorF]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [typeF,    setTypeF]    = useState<'' | 'single' | 'bulk'>('');
  const [statusF,  setStatusF]  = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Stats (computed server-side across all matching pages, not just the current page)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [typeCounts,   setTypeCounts]   = useState<{ single: number; bulk: number }>({ single: 0, bulk: 0 });
  const [masterTracking, setMasterTracking] = useState(false);

  useEffect(() => {
    axios.get('/vendors').then(r => setVendors(r.data.vendors || [])).catch(() => {});
  }, []);

  const fetchLabels = useCallback(async () => {
    setIsLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: '35' });
      if (carrierF) p.append('carrier',  carrierF);
      if (vendorF)  p.append('vendor',   vendorF);
      if (dateFrom) p.append('dateFrom', dateFrom);
      if (dateTo)   p.append('dateTo',   dateTo);
      if (typeF)    p.append('type',     typeF);
      if (statusF)  p.append('trackingStatus', statusF);
      const res = await axios.get(`/labels?${p}`);
      setLabels(res.data.labels || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
      setStatusCounts(res.data.statusCounts || {});
      setTypeCounts(res.data.typeCounts || { single: 0, bulk: 0 });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, [page, carrierF, vendorF, dateFrom, dateTo, typeF, statusF]);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  // Close action menu on outside click
  useEffect(() => {
    const handler = () => setOpenAction(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const resetFilters = () => { setCarrierF(''); setVendorF(''); setDateFrom(''); setDateTo(''); setSearch(''); setTypeF(''); setStatusF(''); setPage(1); setShowDateFilter(false); };

  const vendorOptions = carrierF ? vendors.filter(v => v.carrier === carrierF) : vendors;

  const filtered = search
    ? labels.filter(l =>
        l.trackingId?.toLowerCase().includes(search.toLowerCase()) ||
        l.to_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.from_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
        l.user?.firstName?.toLowerCase().includes(search.toLowerCase())
      )
    : labels;

  const totalSpent = labels.reduce((s, l) => s + (l.price || 0), 0);
  const hasFilters = !!(carrierF || vendorF || dateFrom || dateTo || typeF || statusF);

  const handleReturn = (label: Label) => {
    navigate('/labels/single', {
      state: {
        prefill: {
          carrier: label.carrier, vendorId: label.vendor?._id ?? '',
          from_name: label.to_name ?? '', from_company: label.to_company ?? '',
          from_phone: label.to_phone ?? '', from_address1: label.to_address1 ?? '',
          from_address2: label.to_address2 ?? '', from_city: label.to_city ?? '',
          from_state: label.to_state ?? '', from_zip: label.to_zip ?? '',
          to_name: label.from_name ?? '', to_company: label.from_company ?? '',
          to_phone: label.from_phone ?? '', to_address1: label.from_address1 ?? '',
          to_address2: label.from_address2 ?? '', to_city: label.from_city ?? '',
          to_state: label.from_state ?? '', to_zip: label.from_zip ?? '',
          weight: String(label.weight ?? ''), length: String(label.length ?? ''),
          width: String(label.width ?? ''), height: String(label.height ?? ''),
          note: label.note ?? '',
        },
      },
    });
  };

  const trackAll = () => {
    const ids = labels
      .filter(l => l.trackingId)
      .map(l => encodeURIComponent(l.trackingId))
      .join(',');
    if (!ids) return;
    window.open(`https://tools.usps.com/go/TrackConfirmAction?tLabels=${ids}`, '_blank', 'noopener,noreferrer');
  };

  // Tracks every label matching the current filters (not just the current page), 35 per tab
  const masterTrackAll = async () => {
    if (masterTracking) return;
    setMasterTracking(true);
    try {
      const p = new URLSearchParams();
      if (carrierF) p.append('carrier', carrierF);
      if (vendorF)  p.append('vendor',  vendorF);
      if (dateFrom) p.append('dateFrom', dateFrom);
      if (dateTo)   p.append('dateTo',   dateTo);
      if (typeF)    p.append('type',     typeF);
      if (statusF)  p.append('trackingStatus', statusF);
      const res = await axios.get(`/labels/track-all-ids?${p}`);
      const ids: string[] = (res.data.items || []).map((i: { trackingId: string }) => i.trackingId).filter(Boolean);
      if (ids.length === 0) return;

      const BATCH = 35;
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));

      if (batches.length > 3) {
        const ok = window.confirm(`This opens ${batches.length} new browser tabs to track all ${ids.length} matching labels (35 per tab). Continue?`);
        if (!ok) return;
      }

      batches.forEach(batch => {
        const url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${batch.map(encodeURIComponent).join(',')}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    } catch (e) {
      console.error('Master track failed', e);
    } finally {
      setMasterTracking(false);
    }
  };

  const openPdf = async (label: Label) => {
    const blobUrl = await fetchLabelPdf(label._id);
    if (blobUrl) setViewPdf({ url: blobUrl, trackingId: label.trackingId });
  };

  const handleUpdateTrackingStatus = async (labelId: string, trackingStatus: string, note = '') => {
    // Optimistic update
    setLabels(prev => prev.map(l => l._id === labelId ? { ...l, trackingStatus } : l));
    try {
      const res = await axios.patch(`/labels/${labelId}/tracking-status`, { trackingStatus, note });
      // Merge back the authoritative history from server
      setLabels(prev => prev.map(l =>
        l._id === labelId
          ? { ...l, trackingStatus: res.data.trackingStatus, trackingStatusHistory: res.data.trackingStatusHistory }
          : l
      ));
      // If the history modal is open for this label, keep it in sync
      setHistoryLabel(prev => prev && prev._id === labelId
        ? { ...prev, trackingStatus: res.data.trackingStatus, trackingStatusHistory: res.data.trackingStatusHistory }
        : prev
      );
    } catch (e) {
      console.error('Failed to update tracking status', e);
      // Revert optimistic update
      setLabels(prev => prev.map(l => l._id === labelId ? { ...l, trackingStatus: l.trackingStatus } : l));
    }
  };

  // Pagination page numbers
  const pageNums = (() => {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) range.push(i);
    if (range[0] > 1) { range.unshift(-1); range.unshift(1); }
    if (range[range.length - 1] < totalPages) { range.push(-2); range.push(totalPages); }
    return range;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', flexShrink: 0 }}>
            <TagIcon style={{ width: 20, height: 20, color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>Label History</h1>
            <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0', fontWeight: 500 }}>
              Individually generated and bulk-uploaded shipping labels
            </p>
          </div>
        </div>

        {/* Summary pills + Track All */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, padding: '6px 14px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1' }} />
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>{total}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: 10, padding: '6px 14px' }}>
            <CurrencyDollarIcon style={{ width: 13, height: 13, color: '#16A34A' }} />
            <span style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>Page spend</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#15803D' }}>${totalSpent.toFixed(2)}</span>
          </div>
          <button
            onClick={trackAll}
            disabled={labels.filter(l => l.trackingId).length === 0}
            title="Open all tracking numbers on this page in USPS multi-track"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 14px',
              background: '#EFF6FF', border: '1.5px solid #BFDBFE',
              borderRadius: 10, color: '#1D4ED8',
              fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.15s',
              opacity: labels.filter(l => l.trackingId).length === 0 ? 0.45 : 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#DBEAFE'; e.currentTarget.style.borderColor = '#93C5FD'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
          >
            <TruckIcon style={{ width: 14, height: 14 }} />
            Track All ({labels.filter(l => l.trackingId).length})
          </button>
          <button
            onClick={masterTrackAll}
            disabled={masterTracking || total === 0}
            title="Track every label matching the current filters, across all pages — opens one tab per 35 labels"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 36, padding: '0 14px',
              background: '#EEF2FF', border: '1.5px solid #C7D2FE',
              borderRadius: 10, color: '#4F46E5',
              fontSize: '0.75rem', fontWeight: 700, cursor: masterTracking ? 'wait' : 'pointer',
              transition: 'all 0.15s',
              opacity: (masterTracking || total === 0) ? 0.55 : 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#E0E7FF'; e.currentTarget.style.borderColor = '#A5B4FC'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#C7D2FE'; }}
          >
            <TruckIcon style={{ width: 14, height: 14 }} />
            {masterTracking ? 'Opening tabs…' : `Master Track (${total})`}
          </button>
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid var(--navy-200)', overflow: 'hidden' }}>

        {/* Top row: search + date toggle + clear */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--navy-100)' }}>
          <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
            <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, tracking ID, email…"
              style={{ width: '100%', boxSizing: 'border-box', height: 36, paddingLeft: 32, paddingRight: 12, border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--navy-800)', outline: 'none', background: 'var(--navy-50)', transition: 'border-color 0.15s' }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = 'var(--navy-200)')}
            />
          </div>

          {/* Vendor filter */}
          {vendorOptions.length > 0 && (
            <select
              value={vendorF}
              onChange={e => { setVendorF(e.target.value); setPage(1); }}
              style={{ height: 36, paddingLeft: 10, paddingRight: 28, border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--navy-50)', cursor: 'pointer', outline: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394A3B8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 16 }}>
              <option value="">All Vendors</option>
              {vendorOptions.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select>
          )}

          <button
            onClick={() => setShowDateFilter(o => !o)}
            style={{ height: 36, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: `1.5px solid ${showDateFilter || dateFrom || dateTo ? '#6366f1' : 'var(--navy-200)'}`, borderRadius: 8, background: showDateFilter || dateFrom || dateTo ? '#EEF2FF' : 'var(--navy-50)', color: showDateFilter || dateFrom || dateTo ? '#4F46E5' : 'var(--navy-500)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
            <CalendarDaysIcon style={{ width: 13, height: 13 }} />
            Date
            {(dateFrom || dateTo) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />}
          </button>

          {hasFilters && (
            <button onClick={resetFilters} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: '1.5px solid #FCA5A5', borderRadius: 8, background: '#FFF5F5', color: '#DC2626', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              <XMarkIcon style={{ width: 12, height: 12 }} /> Clear
            </button>
          )}
        </div>

        {/* Carrier tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 0.875rem', borderBottom: '1px solid var(--navy-100)', overflowX: 'auto' }}>
          {['', ...CARRIERS].map(c => {
            const active = carrierF === c;
            const theme = c ? CC[c] : null;
            return (
              <button
                key={c || 'all'}
                onClick={() => { setCarrierF(c); setVendorF(''); setPage(1); }}
                style={{
                  padding: '0.5rem 0.875rem', border: 'none', background: 'transparent',
                  fontSize: '0.75rem', fontWeight: active ? 700 : 500,
                  color: active ? (theme?.color ?? '#4F46E5') : 'var(--navy-500)',
                  borderBottom: `2px solid ${active ? (theme?.accent ?? '#6366f1') : 'transparent'}`,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all 0.15s', marginBottom: -1,
                }}>
                {c || 'All Carriers'}
              </button>
            );
          })}
        </div>

        {/* Type tabs: Single vs Bulk */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 0.875rem', borderBottom: '1px solid var(--navy-100)', overflowX: 'auto' }}>
          {[
            { key: '' as const,       label: `All Types (${typeCounts.single + typeCounts.bulk})` },
            { key: 'single' as const, label: `Single (${typeCounts.single})` },
            { key: 'bulk' as const,   label: `Bulk (${typeCounts.bulk})` },
          ].map(t => {
            const active = typeF === t.key;
            return (
              <button
                key={t.key || 'all-types'}
                onClick={() => { setTypeF(t.key); setPage(1); }}
                style={{
                  padding: '0.5rem 0.875rem', border: 'none', background: 'transparent',
                  fontSize: '0.75rem', fontWeight: active ? 700 : 500,
                  color: active ? '#4F46E5' : 'var(--navy-500)',
                  borderBottom: `2px solid ${active ? '#6366f1' : 'transparent'}`,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all 0.15s', marginBottom: -1,
                }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Label stats / status filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--navy-100)', overflowX: 'auto' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, marginRight: 2 }}>Status</span>
          <button
            onClick={() => { setStatusF(''); setPage(1); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 20,
              border: `1.5px solid ${statusF === '' ? '#6366f1' : 'var(--navy-200)'}`,
              background: statusF === '' ? '#6366f1' : 'var(--navy-50)',
              color: statusF === '' ? '#fff' : 'var(--navy-500)',
              fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}>
            All
            <span style={{ background: statusF === '' ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.06)', borderRadius: 10, padding: '1px 6px', fontSize: '0.63rem' }}>
              {Object.values(statusCounts).reduce((a, b) => a + b, 0)}
            </span>
          </button>
          {TS_OPTIONS.map(k => {
            const cfg = TS_CONFIG[k];
            const count = statusCounts[k] ?? 0;
            const active = statusF === k;
            return (
              <button
                key={k}
                onClick={() => { setStatusF(active ? '' : k); setPage(1); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 20,
                  border: `1.5px solid ${active ? cfg.color : cfg.border}`,
                  background: active ? cfg.color : cfg.bg,
                  color: active ? '#fff' : cfg.color,
                  fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}>
                {cfg.label}
                <span style={{ background: active ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.06)', borderRadius: 10, padding: '1px 6px', fontSize: '0.63rem' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Date range row */}
        {showDateFilter && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.625rem 0.875rem', background: 'var(--navy-50)' }}>
            <CalendarDaysIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>From</label>
              <input type="date" value={dateFrom} max={dateTo || undefined}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                style={{ height: 32, padding: '0 8px', border: '1.5px solid var(--navy-200)', borderRadius: 7, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none' }} />
              <ArrowRightIcon style={{ width: 12, height: 12, color: 'var(--navy-300)' }} />
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>To</label>
              <input type="date" value={dateTo} min={dateFrom || undefined}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                style={{ height: 32, padding: '0 8px', border: '1.5px solid var(--navy-200)', borderRadius: 7, fontSize: '0.78rem', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none' }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex', padding: 2 }}>
                  <XMarkIcon style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Table card ── */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1.5px solid var(--navy-200)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--navy-50)' }}>
                {['#', 'Tracking & Carrier', 'Route', 'User', 'Vendor', 'Type', 'Price', 'Date', 'Tracking Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.625rem 0.875rem', textAlign: 'left', fontSize: '0.63rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', borderBottom: '1.5px solid var(--navy-200)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '4rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TagIcon style={{ width: 26, height: 26, color: '#CBD5E1' }} />
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>No labels found</div>
                      <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                        {hasFilters ? 'Try adjusting your filters or clearing them.' : 'Labels you generate will appear here.'}
                      </div>
                      {hasFilters && (
                        <button onClick={resetFilters} style={{ marginTop: 4, padding: '6px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((label, idx) => {
                  const theme    = CC[label.carrier] ?? { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', accent: '#94A3B8' };
                  const rowNum   = (page - 1) * 35 + idx + 1;
                  const isMenuOpen = openAction === label._id;

                  return (
                    <tr key={label._id}
                      style={{ borderBottom: '1px solid var(--navy-100)', transition: 'background 0.12s', position: 'relative' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                      {/* # */}
                      <td style={{ padding: '0.875rem 0.875rem 0.875rem 1rem', width: 40 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 3, height: 36, borderRadius: 2, background: theme.accent, flexShrink: 0 }} />
                          <span style={{ fontSize: '0.7rem', color: '#CBD5E1', fontWeight: 700 }}>{String(rowNum).padStart(2, '0')}</span>
                        </div>
                      </td>

                      {/* Tracking & Carrier */}
                      <td style={{ padding: '0.875rem 0.875rem', minWidth: 170 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ background: theme.bg, color: theme.color, border: `1px solid ${theme.border}`, borderRadius: 5, padding: '2px 7px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                            {label.carrier}
                          </span>
                          {label.status === 'generated' && (
                            <CheckCircleIcon style={{ width: 13, height: 13, color: '#22C55E', flexShrink: 0 }} />
                          )}
                        </div>
                        {label.trackingId ? (
                          <a
                            href={getTrackUrl(label.carrier, label.trackingId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Track this shipment"
                            style={{ fontFamily: 'monospace', fontSize: '0.73rem', color: 'var(--navy-800)', fontWeight: 600, textDecoration: 'none', display: 'block', maxWidth: 155, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            onMouseEnter={e => (e.currentTarget.style.color = theme.color)}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--navy-800)')}
                          >
                            {label.trackingId}
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#CBD5E1' }}>No tracking ID</span>
                        )}
                      </td>

                      {/* Route: From → To */}
                      <td style={{ padding: '0.875rem 0.875rem', minWidth: 180 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 1 }}>From</div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>{label.from_name}</div>
                            <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{label.from_city}, {label.from_state}</div>
                          </div>
                          <ArrowRightIcon style={{ width: 12, height: 12, color: '#CBD5E1', marginTop: 14, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 1 }}>To</div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>{label.to_name}</div>
                            <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{label.to_city}, {label.to_state}</div>
                          </div>
                        </div>
                      </td>

                      {/* User */}
                      <td style={{ padding: '0.875rem 0.875rem', minWidth: 130 }}>
                        {label.user ? (
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>{label.user.firstName} {label.user.lastName}</div>
                            <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: 1, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.user.email}</div>
                          </div>
                        ) : <span style={{ fontSize: '0.72rem', color: '#CBD5E1' }}>—</span>}
                      </td>

                      {/* Vendor */}
                      <td style={{ padding: '0.875rem 0.875rem', minWidth: 110 }}>
                        <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.vendorName || '—'}</div>
                        {label.shippingService && <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: 1 }}>{label.shippingService}</div>}
                      </td>

                      {/* Type */}
                      <td style={{ padding: '0.875rem 0.875rem' }}>
                        <span style={{
                          fontSize: '0.63rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                          background: label.isBulk ? '#FDF4FF' : '#EEF2FF',
                          color:      label.isBulk ? '#A21CAF' : '#4F46E5',
                          border: `1px solid ${label.isBulk ? '#F5D0FE' : '#E0E7FF'}`,
                        }}>
                          {label.isBulk ? 'Bulk' : 'Single'}
                        </span>
                      </td>

                      {/* Price */}
                      <td style={{ padding: '0.875rem 0.875rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                          ${(label.price ?? 0).toFixed(2)}
                        </span>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '0.875rem 0.875rem', whiteSpace: 'nowrap', minWidth: 90 }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#1E293B' }}>
                          {new Date(label.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.67rem', color: '#94A3B8', marginTop: 1 }}>
                          {new Date(label.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Tracking Status */}
                      <td style={{ padding: '0.875rem 0.875rem', minWidth: 170 }}>
                        {(() => {
                          const ts = resolveTs(label.trackingStatus);
                          const cfg = TS_CONFIG[ts];
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {isAdmin ? (
                                <select
                                  value={ts}
                                  onChange={e => handleUpdateTrackingStatus(label._id, e.target.value)}
                                  style={{
                                    flex: 1, height: 28, paddingLeft: 7, paddingRight: 22,
                                    border: `1.5px solid ${cfg.border}`, borderRadius: 6,
                                    fontSize: '0.68rem', fontWeight: 700, color: cfg.color,
                                    backgroundColor: cfg.bg, cursor: 'pointer', outline: 'none',
                                    appearance: 'none' as const,
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394A3B8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center', backgroundSize: 13,
                                  }}>
                                  {TS_OPTIONS.map(k => <option key={k} value={k}>{TS_CONFIG[k].label}</option>)}
                                </select>
                              ) : (
                                <span
                                  onClick={() => setHistoryLabel(label)}
                                  style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '3px 9px', fontSize: '0.65rem', fontWeight: 700, display: 'inline-block', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                                  {cfg.label}
                                </span>
                              )}
                              {/* History icon */}
                              <button
                                onClick={() => setHistoryLabel(label)}
                                title="View status history"
                                style={{ width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--navy-200)', borderRadius: 6, background: 'var(--navy-50)', color: 'var(--navy-400)', cursor: 'pointer', transition: 'all 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'var(--navy-50)'; e.currentTarget.style.borderColor = 'var(--navy-200)'; e.currentTarget.style.color = 'var(--navy-400)'; }}>
                                <ClockIcon style={{ width: 11, height: 11 }} />
                              </button>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.875rem 0.875rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

                          {/* Return */}
                          <button
                            onClick={() => handleReturn(label)}
                            title="Return label"
                            style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 9px', border: '1.5px solid #E0E7FF', borderRadius: 7, background: '#EEF2FF', color: '#4F46E5', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#E0E7FF'; e.currentTarget.style.borderColor = '#6366F1'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#E0E7FF'; }}>
                            <ArrowUturnLeftIcon style={{ width: 11, height: 11 }} />
                            Return
                          </button>

                          {/* Track */}
                          {label.trackingId && (
                            <a
                              href={getTrackUrl(label.carrier, label.trackingId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Track on ${label.carrier}`}
                              style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 9px', border: `1.5px solid ${theme.border}`, borderRadius: 7, background: theme.bg, color: theme.color, fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', cursor: 'pointer', transition: 'filter 0.15s', whiteSpace: 'nowrap' }}
                              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.93)')}
                              onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>
                              <TruckIcon style={{ width: 11, height: 11 }} />
                              Track
                            </a>
                          )}

                          {/* View + Download dropdown */}
                          {label.pdfUrl && (
                            <div style={{ position: 'relative' }}>
                              <button
                                onClick={e => { e.stopPropagation(); setOpenAction(isMenuOpen ? null : label._id); }}
                                title="PDF options"
                                style={{ height: 30, width: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--navy-200)', borderRadius: 7, background: isMenuOpen ? 'var(--navy-100)' : 'var(--bg-card)', color: 'var(--navy-500)', cursor: 'pointer', transition: 'all 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--navy-100)'; e.currentTarget.style.borderColor = 'var(--navy-300)'; }}
                                onMouseLeave={e => { if (!isMenuOpen) { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.borderColor = 'var(--navy-200)'; } }}>
                                <FunnelIcon style={{ width: 13, height: 13 }} />
                              </button>

                              {isMenuOpen && (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  style={{ position: 'absolute', right: 0, top: 'calc(100% + 5px)', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 150, overflow: 'hidden' }}>
                                  <button
                                    onClick={() => { openPdf(label); setOpenAction(null); }}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 0.875rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--navy-800)', fontWeight: 600, textAlign: 'left', transition: 'background 0.12s' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                    <EyeIcon style={{ width: 14, height: 14, color: '#64748B', flexShrink: 0 }} />
                                    View PDF
                                  </button>
                                  <div style={{ height: 1, background: 'var(--navy-100)', margin: '0 0.625rem' }} />
                                  <button
                                    onClick={() => { downloadLabelPdf(label._id, label.trackingId); setOpenAction(null); }}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 0.875rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--navy-800)', fontWeight: 600, textAlign: 'left', transition: 'background 0.12s' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                    <ArrowDownTrayIcon style={{ width: 14, height: 14, color: '#64748B', flexShrink: 0 }} />
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
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!isLoading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1.5px solid var(--navy-100)', background: 'var(--navy-50)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontWeight: 500 }}>
              Showing {(page - 1) * 35 + 1}–{Math.min(page * 35, total)} of <strong style={{ color: 'var(--navy-600)' }}>{total}</strong> labels
            </span>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #E2E8F0', borderRadius: 7, background: page <= 1 ? '#F8FAFC' : '#fff', color: page <= 1 ? '#CBD5E1' : '#475569', cursor: page <= 1 ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                <ChevronLeftIcon style={{ width: 13, height: 13 }} />
              </button>

              {pageNums.map((n) =>
                n < 0 ? (
                  <span key={`ellipsis-${n}`} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#CBD5E1' }}>…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${n === page ? '#6366f1' : '#E2E8F0'}`, borderRadius: 7, background: n === page ? '#6366f1' : '#fff', color: n === page ? '#fff' : '#475569', fontSize: '0.75rem', fontWeight: n === page ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {n}
                  </button>
                )
              )}

              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #E2E8F0', borderRadius: 7, background: page >= totalPages ? '#F8FAFC' : '#fff', color: page >= totalPages ? '#CBD5E1' : '#475569', cursor: page >= totalPages ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                <ChevronRightIcon style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {viewPdf && <PdfModal url={viewPdf.url} trackingId={viewPdf.trackingId} onClose={() => setViewPdf(null)} />}
      {historyLabel && (
        <StatusHistoryModal
          label={historyLabel}
          isAdmin={isAdmin}
          onClose={() => setHistoryLabel(null)}
          onSave={handleUpdateTrackingStatus}
        />
      )}

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};

export default LabelHistory;
