import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  MagnifyingGlassIcon, XMarkIcon, ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon, ArrowPathIcon,
  ChevronLeftIcon, ChevronRightIcon, TagIcon,
  CheckCircleIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');
const PAGE_SIZE = 20;

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 7 ? `${days}d ago` : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface BulkJob {
  _id: string; bulkFileName: string; bulkZipUrl?: string;
  carrier: string; vendorName: string; portal?: string;
  totalLabels: number; totalPrice: number;
  generatedCount: number; failedCount: number;
  trackingIds: string[];
  createdAt: string;
  user?: { _id: string; firstName: string; lastName: string; email: string };
}

const CARRIER_STYLE: Record<string, { bg: string; color: string; accent: string }> = {
  USPS:  { bg: '#EFF6FF', color: '#1D4ED8', accent: '#3B82F6' },
  UPS:   { bg: '#FFFBEB', color: '#92400E', accent: '#F59E0B' },
  FedEx: { bg: '#F5F3FF', color: '#5B21B6', accent: '#7C3AED' },
  DHL:   { bg: '#FEF3C7', color: '#78350F', accent: '#D97706' },
};

function jobStatus(job: BulkJob) {
  if (job.failedCount === 0)    return 'success';
  if (job.generatedCount === 0) return 'failed';
  return 'partial';
}
const STATUS_CFG = {
  success: { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'Complete' },
  partial: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Partial'  },
  failed:  { bg: '#FFF5F5', color: '#DC2626', border: '#FECACA', label: 'Failed'   },
};

const inp: React.CSSProperties = { height: 34, padding: '0 0.7rem', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.8rem', fontFamily: FONT, outline: 'none', boxSizing: 'border-box' };
const thBase: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' };

// ── Tracking detail label shape ────────────────────────────────
interface DetailLabel {
  _id: string; trackingId: string; trackingStatus?: string;
  to_name: string; to_city: string; to_state: string; to_zip: string;
}

interface MatchedPair {
  label: DetailLabel;
  newTracking: string;
  matched: boolean;
}

// ── Add Tracking Modal ─────────────────────────────────────────
function AddTrackingModal({ job, token, onClose, onApplied }: {
  job: BulkJob; token: string; onClose: () => void; onApplied: () => void;
}) {
  const [labels,    setLabels]    = useState<DetailLabel[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [mode,      setMode]      = useState<'seq' | 'zip'>('seq');
  const [paste,     setPaste]     = useState('');
  const [pairs,     setPairs]     = useState<MatchedPair[] | null>(null);
  const [applying,  setApplying]  = useState(false);
  const [applied,   setApplied]   = useState<number | null>(null);

  useEffect(() => {
    axios.get(`${API_BASE}/labels/bulk-detail/${job._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => setLabels(r.data.labels || [])).catch(() => {}).finally(() => setLoading(false));
  }, [job._id, token]);

  const preview = () => {
    const lines = paste.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (mode === 'seq') {
      const result: MatchedPair[] = labels.map((lbl, i) => ({
        label:       lbl,
        newTracking: lines[i] || '',
        matched:     !!lines[i],
      }));
      setPairs(result);
    } else {
      // By ZIP: each line is "tracking,zip"
      const zipMap: Record<string, string> = {};
      lines.forEach(line => {
        const comma = line.indexOf(',');
        if (comma === -1) return;
        const tracking = line.slice(0, comma).trim();
        const zip      = line.slice(comma + 1).trim().replace(/\D/g, '').slice(0, 5);
        if (tracking && zip) zipMap[zip] = tracking;
      });
      const result: MatchedPair[] = labels.map(lbl => {
        const zip5 = (lbl.to_zip || '').replace(/\D/g, '').slice(0, 5);
        const t    = zipMap[zip5] || '';
        return { label: lbl, newTracking: t, matched: !!t };
      });
      setPairs(result);
    }
  };

  const apply = async () => {
    if (!pairs) return;
    const updates = pairs
      .filter(p => p.matched && p.newTracking)
      .map(p => ({ labelId: p.label._id, trackingId: p.newTracking }));
    if (!updates.length) return;
    setApplying(true);
    try {
      const r = await axios.patch(
        `${API_BASE}/labels/bulk-tracking-assign`,
        { updates },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setApplied(r.data.updated || 0);
      onApplied();
    } catch {}
    setApplying(false);
  };

  const matchedCount  = pairs?.filter(p => p.matched).length ?? 0;
  const unmatchedCount = pairs ? pairs.length - matchedCount : 0;

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,6,23,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', backdropFilter: 'blur(4px)' }}
    >
      <div style={{ background: 'var(--bg-card)', borderRadius: 18, overflow: 'hidden', width: '100%', maxWidth: 1060, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.45)', fontFamily: FONT }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.25rem', borderBottom: '1.5px solid var(--navy-200)', background: 'var(--navy-50)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TagIcon style={{ width: 17, height: 17, color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.02em' }}>
                Add Tracking Numbers
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>
                {job.carrier} · {job.bulkFileName || 'Unnamed batch'} · {labels.length} labels
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', borderRadius: 8, background: 'var(--navy-100)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-500)', flexShrink: 0 }}>
            <XMarkIcon style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-50)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Match mode:</span>
          {([['seq', 'Sequential (by order)'], ['zip', 'By ZIP code (tracking, zip)']] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setMode(k); setPairs(null); }}
              style={{ padding: '4px 12px', borderRadius: 99, border: `1.5px solid ${mode === k ? '#6366f1' : 'var(--navy-200)'}`, background: mode === k ? '#6366f1' : 'transparent', color: mode === k ? '#fff' : 'var(--navy-600)', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
          <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginLeft: 4 }}>
            {mode === 'seq'
              ? 'Paste one tracking number per line — matched top-to-bottom in the same order as labels below.'
              : 'Each line: tracking_number,zip_code — matched by destination ZIP.'}
          </span>
        </div>

        {/* Body */}
        <div className="cc-modal-body" style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left: label list */}
          <div className="cc-modal-list" style={{ flex: 1, overflowY: 'auto', borderRight: '1.5px solid var(--navy-200)', minWidth: 0 }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.82rem' }}>Loading labels…</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--navy-50)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1.5px solid var(--navy-200)' }}>
                    <th style={{ ...thBase, width: 36 }}>#</th>
                    <th style={thBase}>Recipient</th>
                    <th style={thBase}>ZIP</th>
                    <th style={thBase}>Current Tracking</th>
                    {pairs && <th style={thBase}>New Tracking</th>}
                  </tr>
                </thead>
                <tbody>
                  {labels.map((lbl, i) => {
                    const pair = pairs?.[i];
                    return (
                      <tr key={lbl._id} style={{ borderBottom: '1px solid var(--navy-100)', background: pair ? (pair.matched ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.03)') : 'transparent' }}>
                        <td style={{ padding: '7px 12px', color: 'var(--navy-300)', fontWeight: 700, fontSize: '0.65rem' }}>{i + 1}</td>
                        <td style={{ padding: '7px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{lbl.to_name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)', marginTop: 1 }}>{lbl.to_city}, {lbl.to_state}</div>
                        </td>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--navy-700)' }}>{lbl.to_zip || '—'}</td>
                        <td style={{ padding: '7px 12px' }}>
                          {lbl.trackingId
                            ? <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#15803d', background: '#F0FDF4', padding: '2px 6px', borderRadius: 5, border: '1px solid #BBF7D0' }}>{lbl.trackingId.slice(0, 20)}{lbl.trackingId.length > 20 ? '…' : ''}</span>
                            : <span style={{ fontSize: '0.68rem', color: 'var(--navy-300)' }}>None</span>
                          }
                        </td>
                        {pairs && (
                          <td style={{ padding: '7px 12px' }}>
                            {pair?.matched
                              ? <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#4F46E5', background: '#EEF2FF', padding: '2px 6px', borderRadius: 5, border: '1px solid #C7D2FE', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                  <CheckCircleIcon style={{ width: 11, height: 11, flexShrink: 0 }} />
                                  {pair.newTracking.slice(0, 20)}{pair.newTracking.length > 20 ? '…' : ''}
                                </span>
                              : <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <ExclamationTriangleIcon style={{ width: 11, height: 11, color: '#f59e0b' }} />
                                  No match
                                </span>
                            }
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Right: paste area */}
          <div className="cc-modal-paste" style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '0.75rem', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-700)' }}>
              {mode === 'seq' ? 'Paste tracking numbers (one per line)' : 'Paste tracking + ZIP (tracking,zip per line)'}
            </div>
            <textarea
              value={paste}
              onChange={e => { setPaste(e.target.value); setPairs(null); setApplied(null); }}
              placeholder={mode === 'seq'
                ? '9400111899223397993164\n9400111899223397993171\n...'
                : '9400111899223397993164,90210\n9400111899223397993171,95112\n...'}
              style={{ flex: 1, minHeight: 240, padding: '0.7rem', border: '1.5px solid var(--navy-200)', borderRadius: 10, fontFamily: 'monospace', fontSize: '0.73rem', color: 'var(--navy-800)', resize: 'none', outline: 'none', background: 'var(--navy-50)', lineHeight: 1.7 }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = 'var(--navy-200)')}
            />
            <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>
              {paste.trim() ? `${paste.trim().split(/\r?\n/).filter(l => l.trim()).length} lines pasted` : 'Nothing pasted yet'}
              {' · '}{labels.length} labels in this batch
            </div>

            {/* Summary after preview */}
            {pairs && (
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#15803d' }}>{matchedCount}</div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#15803d' }}>Matched</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: '0.5rem', borderRadius: 8, background: unmatchedCount > 0 ? 'rgba(239,68,68,0.07)' : 'var(--navy-50)', border: `1px solid ${unmatchedCount > 0 ? 'rgba(239,68,68,0.2)' : 'var(--navy-200)'}` }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: unmatchedCount > 0 ? '#dc2626' : 'var(--navy-300)' }}>{unmatchedCount}</div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: unmatchedCount > 0 ? '#dc2626' : 'var(--navy-400)' }}>Unmatched</div>
                </div>
              </div>
            )}

            {applied !== null && (
              <div style={{ padding: '0.6rem 0.8rem', borderRadius: 9, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <CheckCircleIcon style={{ width: 16, height: 16, color: '#15803d', flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#15803d' }}>{applied} labels updated!</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 1.25rem', borderTop: '1.5px solid var(--navy-200)', background: 'var(--navy-50)', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1.1rem', borderRadius: 9, border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)', color: 'var(--navy-700)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
            Close
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={preview}
              disabled={!paste.trim() || loading}
              style={{ padding: '0.5rem 1.2rem', borderRadius: 9, border: '1.5px solid var(--navy-200)', background: 'var(--navy-100)', color: 'var(--navy-800)', fontSize: '0.8rem', fontWeight: 700, cursor: paste.trim() && !loading ? 'pointer' : 'not-allowed', opacity: paste.trim() && !loading ? 1 : 0.5, fontFamily: FONT }}
            >
              Preview Matches
            </button>
            <button
              onClick={apply}
              disabled={!pairs || matchedCount === 0 || applying || applied !== null}
              style={{ padding: '0.5rem 1.4rem', borderRadius: 9, border: 'none', background: pairs && matchedCount > 0 && !applying && applied === null ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'var(--navy-200)', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: pairs && matchedCount > 0 && !applying && applied === null ? 'pointer' : 'not-allowed', fontFamily: FONT }}
            >
              {applying ? 'Saving…' : applied !== null ? 'Applied ✓' : `Apply ${matchedCount > 0 ? matchedCount : ''} Matches`}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 700px) {
          .cc-modal-body { flex-direction: column; }
          .cc-modal-list { border-right: none !important; border-bottom: 1.5px solid var(--navy-200); max-height: 38vh; }
          .cc-modal-paste { width: 100% !important; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

export default function CCBulkLabels() {
  const { token } = useAuth();

  const [jobs,       setJobs]       = useState<BulkJob[]>([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);

  const [search,   setSearch]   = useState('');
  const [carrier,  setCarrier]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const [downloading,   setDownloading]   = useState<string | null>(null);
  const [trackingModal, setTrackingModal] = useState<BulkJob | null>(null);

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchJobs = useCallback(() => {
    setLoading(true);
    const p: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
    if (search)   p.search   = search;
    if (carrier)  p.carrier  = carrier;
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo)   p.dateTo   = dateTo;

    axios.get(`${API_BASE}/labels/bulk-jobs`, { headers: authH(), params: p })
      .then(r => {
        setJobs(r.data.jobs || []);
        setTotal(r.data.total || 0);
        setTotalPages(r.data.totalPages || 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, carrier, dateFrom, dateTo, authH]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const downloadZip = async (job: BulkJob) => {
    if (!job.bulkZipUrl) return;
    setDownloading(job._id);
    try {
      const r = await axios.get(job.bulkZipUrl, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a   = document.createElement('a');
      a.href = url; a.download = `${job.bulkFileName}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
    setDownloading(null);
  };

  const openTrack = (carrier: string, ids: string[]) => {
    chunkArray(ids.filter(Boolean), 35).forEach(chunk => {
      const enc = encodeURIComponent(chunk.join(','));
      const url = carrier === 'UPS'   ? `https://www.ups.com/track?tracknum=${enc}` :
                  carrier === 'FedEx' ? `https://www.fedex.com/fedextrack/?trknbr=${enc}` :
                  `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc}`;
      window.open(url, '_blank');
    });
  };

  const hasFilters = search || carrier || dateFrom || dateTo;
  const clearFilters = () => { setSearch(''); setCarrier(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>Bulk Batches</h1>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99 }}>
              {total.toLocaleString()} batches
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>All users' bulk upload batches</div>
        </div>
        <button onClick={fetchJobs} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.9rem', borderRadius: 8, background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', color: 'var(--navy-600)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
          <ArrowPathIcon style={{ width: 14, height: 14 }} /> Refresh
        </button>
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="db-card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1, minWidth: 200 }}>
            <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)' }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search file name…" style={{ ...inp, paddingLeft: 30, width: '100%' }} />
          </div>
          <div style={{ position: 'relative' }}>
            <select value={carrier} onChange={e => { setCarrier(e.target.value); setPage(1); }} style={{ ...inp, cursor: 'pointer', paddingRight: '1.8rem', appearance: 'none' as const, minWidth: 130 }}>
              <option value="">All Carriers</option>
              {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--navy-400)' }} width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
          </div>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={{ ...inp, width: 138 }} />
          <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPage(1); }} style={{ ...inp, width: 138 }} />
          {hasFilters && (
            <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 0.75rem', height: 34, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              <XMarkIcon style={{ width: 13, height: 13 }} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT }}>
            <thead>
              <tr style={{ background: 'var(--navy-50)', borderBottom: '1.5px solid var(--navy-200)' }}>
                <th style={thBase}>Batch</th>
                <th style={thBase}>Carrier</th>
                <th style={thBase}>Vendor</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Total</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Generated</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Failed</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Price</th>
                <th style={thBase}>Status</th>
                <th style={thBase}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={{ padding: '10px 12px' }}>
                        <div style={{ height: 10, borderRadius: 5, background: 'var(--navy-100)', animation: 'bl-shimmer 1.5s infinite', animationDelay: `${i * 80}ms` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem' }}>
                    No batches found{hasFilters ? ' — try adjusting filters' : ''}
                  </td>
                </tr>
              ) : (
                jobs.map(job => {
                  const st   = jobStatus(job);
                  const sCfg = STATUS_CFG[st];
                  const cCfg = CARRIER_STYLE[job.carrier] || { bg: '#F8FAFC', color: '#475569', accent: '#94A3B8' };
                  const isDl = downloading === job._id;
                  const valIds = job.trackingIds?.filter(Boolean) || [];

                  return (
                    <tr key={job._id} style={{ borderBottom: '1px solid var(--navy-100)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Batch name + user + time */}
                      <td style={{ padding: '10px 12px', maxWidth: 240 }}>
                        <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.bulkFileName || 'Unnamed batch'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 2, whiteSpace: 'nowrap' }}>
                          {timeAgo(job.createdAt)}
                        </div>
                      </td>

                      {/* Carrier */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: cCfg.bg, color: cCfg.color, border: `1px solid ${cCfg.accent}30`, whiteSpace: 'nowrap' }}>
                          {job.carrier}
                        </span>
                      </td>

                      {/* Vendor */}
                      <td style={{ padding: '10px 12px', color: 'var(--navy-600)', fontSize: '0.76rem', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {job.vendorName || '—'}
                      </td>

                      {/* Total */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--navy-800)' }}>
                        {job.totalLabels.toLocaleString()}
                      </td>

                      {/* Generated */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                        {job.generatedCount.toLocaleString()}
                      </td>

                      {/* Failed */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: job.failedCount > 0 ? '#dc2626' : 'var(--navy-300)' }}>
                        {job.failedCount > 0 ? job.failedCount.toLocaleString() : '—'}
                      </td>

                      {/* Price */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--navy-700)', whiteSpace: 'nowrap' }}>
                        ${job.totalPrice.toFixed(2)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: sCfg.bg, color: sCfg.color, border: `1px solid ${sCfg.border}`, whiteSpace: 'nowrap' }}>
                          {sCfg.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          {valIds.length > 0 && (
                            <button onClick={() => openTrack(job.carrier, valIds)} title="Track all" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.6rem', borderRadius: 6, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', color: 'var(--navy-600)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                              <ArrowTopRightOnSquareIcon style={{ width: 11, height: 11 }} /> Track
                            </button>
                          )}
                          {job.bulkZipUrl && (
                            <button onClick={() => downloadZip(job)} disabled={isDl} title="Download ZIP" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.6rem', borderRadius: 6, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1', fontSize: '0.7rem', fontWeight: 600, cursor: isDl ? 'wait' : 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                              <ArrowDownTrayIcon style={{ width: 11, height: 11 }} /> {isDl ? '…' : 'ZIP'}
                            </button>
                          )}
                          <button onClick={() => setTrackingModal(job)} title="Add tracking numbers" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.6rem', borderRadius: 6, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', color: '#15803d', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                            <TagIcon style={{ width: 11, height: 11 }} /> Tracking
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ─────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--navy-400)' }}>Page {page} of {totalPages} · {total.toLocaleString()} total</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)', cursor: page > 1 ? 'pointer' : 'not-allowed', color: page > 1 ? 'var(--navy-700)' : 'var(--navy-300)' }}>
              <ChevronLeftIcon style={{ width: 14, height: 14 }} />
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 0.7rem', borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'var(--bg-card)', cursor: page < totalPages ? 'pointer' : 'not-allowed', color: page < totalPages ? 'var(--navy-700)' : 'var(--navy-300)' }}>
              <ChevronRightIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      {trackingModal && (
        <AddTrackingModal
          job={trackingModal}
          token={token!}
          onClose={() => setTrackingModal(null)}
          onApplied={fetchJobs}
        />
      )}
    </div>
  );
}
