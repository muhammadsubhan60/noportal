import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  MagnifyingGlassIcon, ArrowDownTrayIcon, RectangleStackIcon,
  XMarkIcon, TruckIcon, CalendarDaysIcon, ArrowRightIcon,
  ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const BATCH_SIZE = 35;

// ── Helpers ────────────────────────────────────────────────────────────────────
function getTrackUrl(carrier: string, ids: string[]): string {
  const joined = encodeURIComponent(ids.join(','));
  if (carrier === 'UPS')   return `https://www.ups.com/track?tracknum=${joined}`;
  if (carrier === 'FedEx') return `https://www.fedex.com/fedextrack/?trknbr=${joined}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${joined}`;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await axios.get(url, { responseType: 'blob' });
    const ct = res.headers['content-type'] || '';
    if (ct.includes('text/html') || ct.includes('text/plain')) {
      alert('Download failed: the server returned an HTML page instead of a ZIP.\n\nMake sure REACT_APP_API_URL is set to your API server URL in your environment.');
      return;
    }
    const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = blobUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (e) { console.error('Download failed', e); alert('Download failed — see browser console for details.'); }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface BulkJob {
  _id: string;
  bulkFileName: string;
  bulkZipUrl?: string;
  carrier: string;
  vendorName: string;
  portal?: string;
  totalLabels: number;
  totalPrice: number;
  generatedCount: number;
  failedCount: number;
  trackingIds: string[];
  createdAt: string;
  user?: { _id: string; firstName: string; lastName: string; email: string };
}
interface LabelDetail {
  _id: string; trackingId: string; pdfUrl?: string; status: string;
  from_name?: string; to_name: string; to_city?: string; to_state?: string; to_zip?: string;
  weight?: number; price?: number;
}
interface Vendor { _id: string; name: string; carrier: string; }

// ── Config ─────────────────────────────────────────────────────────────────────
const CC: Record<string, { bg: string; color: string; border: string; accent: string }> = {
  USPS:  { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', accent: '#3B82F6' },
  UPS:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', accent: '#F59E0B' },
  FedEx: { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE', accent: '#7C3AED' },
  DHL:   { bg: '#FEF3C7', color: '#78350F', border: '#FDE68A', accent: '#D97706' },
};
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'];

const PORTALS = [
  { id: 'shippershub', label: 'ShippersHub', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  { id: 'labelcrow',   label: 'Label Crow',  bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  { id: 'shiplabel',   label: 'ShipLabel',   bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
];

// ── Status helpers ─────────────────────────────────────────────────────────────
function jobStatus(job: BulkJob): 'success' | 'partial' | 'failed' {
  if (job.failedCount === 0)    return 'success';
  if (job.generatedCount === 0) return 'failed';
  return 'partial';
}

const STATUS_CFG = {
  success: { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'Complete', dot: '#22C55E' },
  partial: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Partial',  dot: '#F59E0B' },
  failed:  { bg: '#FFF5F5', color: '#DC2626', border: '#FECACA', label: 'Failed',   dot: '#EF4444' },
};

// ── Skeleton card ──────────────────────────────────────────────────────────────
const SkeletonCard = ({ delay = 0 }: { delay?: number }) => (
  <div className="db-card" style={{ padding: '0.9rem 1.4rem 0.9rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', overflow: 'hidden', position: 'relative' }}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--navy-200)', borderRadius: '3px 0 0 3px' }} />
    {[150, 55, 0, 60, 55, 70, 65].map((w, i) =>
      w === 0 ? <div key={i} style={{ flex: 1 }} /> :
      <div key={i} style={{ height: 10, width: w, borderRadius: 5, background: 'linear-gradient(90deg,var(--navy-100) 25%,var(--navy-50) 50%,var(--navy-100) 75%)', backgroundSize: '200% 100%', animation: 'bl-shimmer 1.5s infinite', animationDelay: `${delay + i * 80}ms`, flexShrink: 0 }} />
    )}
  </div>
);

// ── Mini progress bar ──────────────────────────────────────────────────────────
const MiniBar = ({ gen, fail, total }: { gen: number; fail: number; total: number }) => {
  if (!total) return null;
  const genPct  = (gen  / total) * 100;
  const failPct = (fail / total) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--navy-100)', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${genPct}%`,  background: 'linear-gradient(90deg,#10B981,#34D399)', transition: 'width 0.5s ease' }} />
        {failPct > 0 && <div style={{ width: `${failPct}%`, background: 'linear-gradient(90deg,#EF4444,#F87171)', marginLeft: 2 }} />}
      </div>
      <div style={{ display: 'flex', gap: 12, fontFamily: FONT, fontSize: '0.72rem' }}>
        <span style={{ color: '#059669', fontWeight: 700 }}>{gen.toLocaleString()} generated</span>
        {fail > 0 && <span style={{ color: '#DC2626', fontWeight: 700 }}>{fail.toLocaleString()} failed</span>}
        <span style={{ color: 'var(--navy-400)' }}>{total.toLocaleString()} total</span>
      </div>
    </div>
  );
};

// ── Job card (expandable) ──────────────────────────────────────────────────────
interface JobCardProps {
  job: BulkJob;
  rowNum: number;
  isExpanded: boolean;
  onToggle: () => void;
  downloading: string | null;
  onDownload: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, rowNum, isExpanded, onToggle, downloading, onDownload }) => {
  const theme    = CC[job.carrier] ?? { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', accent: '#94A3B8' };
  const st       = jobStatus(job);
  const cfg      = STATUS_CFG[st];
  const portal   = PORTALS.find(p => p.id === job.portal);
  const validIds = job.trackingIds.filter(Boolean);
  const batches  = chunkArray(validIds, BATCH_SIZE);
  const fname    = job.bulkFileName || '—';
  const isDl     = downloading === job._id;

  const [rowHov,       setRowHov]       = useState(false);
  const [details,      setDetails]      = useState<LabelDetail[] | null>(null);
  const [detailLoad,   setDetailLoad]   = useState(false);
  const [liveGen,      setLiveGen]      = useState<number | null>(null);
  const [liveFail,     setLiveFail]     = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isInProgress = job.generatedCount + job.failedCount < job.totalLabels;
  const displayGen   = liveGen  ?? job.generatedCount;
  const displayFail  = liveFail ?? job.failedCount;

  useEffect(() => {
    if (!isExpanded) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (details !== null) return;

    setDetailLoad(true);
    axios.get(`labels/bulk-detail/${job._id}`)
      .then(r => setDetails(r.data.labels || []))
      .catch(() => setDetails([]))
      .finally(() => setDetailLoad(false));

    if (job.portal === 'shiplabel' && isInProgress) {
      const poll = () => {
        axios.get(`labels/shiplabel-job/${job._id}`)
          .then(r => {
            setLiveGen(r.data.generated);
            setLiveFail(r.data.failed);
            if (r.data.done) {
              if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
              axios.get(`labels/bulk-detail/${job._id}`).then(r2 => setDetails(r2.data.labels || []));
            }
          })
          .catch(() => {});
      };
      poll();
      pollRef.current = setInterval(poll, 3000);
    }

    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="db-card"
      style={{ overflow: 'hidden' }}
    >
      {/* ── Compact row ─────────────────────────────────────────── */}
      <div
        onClick={onToggle}
        onMouseEnter={() => setRowHov(true)}
        onMouseLeave={() => setRowHov(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.85rem',
          padding: '0.85rem 1.1rem 0.85rem 0',
          cursor: 'pointer',
          background: rowHov ? 'var(--navy-50)' : 'transparent',
          transition: 'background 0.12s',
          position: 'relative',
          userSelect: 'none',
        }}
      >
        {/* carrier accent bar */}
        <div style={{ width: 3, alignSelf: 'stretch', background: theme.accent, borderRadius: '0 2px 2px 0', flexShrink: 0 }} />

        {/* row number */}
        <span style={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-300)', minWidth: 22, flexShrink: 0 }}>
          {String(rowNum).padStart(2, '0')}
        </span>

        {/* carrier badge */}
        <span style={{
          background: theme.bg, color: theme.color, border: `1px solid ${theme.border}`,
          borderRadius: 6, padding: '3px 8px', fontSize: '0.63rem', fontWeight: 800,
          letterSpacing: '0.05em', flexShrink: 0, fontFamily: FONT,
        }}>
          {job.carrier}
        </span>

        {/* filename */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fname}>
            {fname}
          </div>
          {job.user && (
            <div style={{ fontFamily: FONT, fontSize: '0.67rem', color: 'var(--navy-400)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {job.user.firstName} {job.user.lastName}
              {job.vendorName ? <> · {job.vendorName}</> : null}
            </div>
          )}
        </div>

        {/* price */}
        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 68 }}>
          <span style={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
            ${job.totalPrice.toFixed(2)}
          </span>
        </div>

        {/* label count */}
        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 54 }}>
          <span style={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)' }}>
            {job.generatedCount}
            <span style={{ color: 'var(--navy-300)', fontWeight: 500 }}>/{job.totalLabels}</span>
          </span>
          <div style={{ fontFamily: FONT, fontSize: '0.6rem', color: 'var(--navy-400)', marginTop: 1 }}>labels</div>
        </div>

        {/* status */}
        <div style={{ flexShrink: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            borderRadius: 20, padding: '3px 9px', fontSize: '0.65rem', fontWeight: 700, fontFamily: FONT,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
          </span>
        </div>

        {/* date */}
        <div style={{ flexShrink: 0, minWidth: 58, textAlign: 'right' }} title={fullDate(job.createdAt)}>
          <span style={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)' }}>
            {timeAgo(job.createdAt)}
          </span>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); onDownload(); }}
            disabled={isDl}
            title="Download ZIP"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${isDl ? 'var(--navy-200)' : '#6366F1'}`,
              borderRadius: 8, cursor: isDl ? 'not-allowed' : 'pointer',
              background: isDl ? 'var(--navy-50)' : '#6366F1',
              color: isDl ? 'var(--navy-400)' : '#fff',
              transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isDl) { (e.currentTarget as HTMLButtonElement).style.background = '#4F46E5'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#4F46E5'; } }}
            onMouseLeave={e => { if (!isDl) { (e.currentTarget as HTMLButtonElement).style.background = '#6366F1'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366F1'; } }}
          >
            {isDl
              ? <div style={{ width: 11, height: 11, border: '2px solid var(--navy-300)', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'bl-spin 0.8s linear infinite' }} />
              : <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />}
          </button>

          <button
            onClick={e => { e.stopPropagation(); onToggle(); }}
            title={isExpanded ? 'Collapse' : 'Expand details'}
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid var(--navy-200)', borderRadius: 8,
              background: isExpanded ? 'var(--navy-100)' : 'var(--navy-50)',
              color: isExpanded ? 'var(--navy-600)' : 'var(--navy-400)',
              cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            <ChevronDownIcon style={{ width: 13, height: 13, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }} />
          </button>
        </div>
      </div>

      {/* ── Expanded panel ──────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateRows: isExpanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ borderTop: '1px solid var(--navy-100)', padding: '1rem 1.1rem 1.1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

            {/* Meta grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.6rem' }}>
              {job.user && (
                <div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 3 }}>Uploaded by</div>
                  <div style={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)' }}>{job.user.firstName} {job.user.lastName}</div>
                  <div style={{ fontFamily: FONT, fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 1, wordBreak: 'break-all' }}>{job.user.email}</div>
                </div>
              )}
              {job.vendorName && (
                <div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 3 }}>Vendor</div>
                  <div style={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)' }}>{job.vendorName}</div>
                </div>
              )}
              {portal && (
                <div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 3 }}>Portal</div>
                  <span style={{ background: portal.bg, color: portal.color, border: `1px solid ${portal.border}`, borderRadius: 20, padding: '3px 9px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.03em', fontFamily: FONT, display: 'inline-block' }}>
                    {portal.label}
                  </span>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 3 }}>File</div>
                <div style={{ fontFamily: FONT, fontSize: '0.72rem', color: 'var(--navy-600)', wordBreak: 'break-all' }}>{fname}</div>
              </div>
            </div>

            {/* Progress bar — live for in-progress ShipLabel jobs */}
            <div style={{ background: 'var(--navy-50)', borderRadius: 10, padding: '0.75rem 0.9rem', border: '1px solid var(--navy-100)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <MiniBar gen={displayGen} fail={displayFail} total={job.totalLabels} />
                {job.portal === 'shiplabel' && isInProgress && liveGen !== null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: '#7C3AED', fontFamily: FONT, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C3AED', animation: 'bl-pulse 1.2s ease-in-out infinite' }} />
                    Live
                  </span>
                )}
              </div>
              <div style={{ fontFamily: FONT, fontSize: '0.68rem', color: 'var(--navy-500)' }}>
                {displayGen} generated · {displayFail} failed · {job.totalLabels - displayGen - displayFail} pending
              </div>
            </div>

            {/* Per-label detail table */}
            <div>
              <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 7 }}>
                Individual Labels
              </div>
              {detailLoad && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--navy-400)', fontFamily: FONT }}>
                  <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Loading labels…
                </div>
              )}
              {!detailLoad && details && details.length > 0 && (
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--navy-100)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: FONT }}>
                    <thead>
                      <tr style={{ background: 'var(--navy-50)', borderBottom: '1px solid var(--navy-100)' }}>
                        <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--navy-500)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
                        <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--navy-500)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recipient</th>
                        <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--navy-500)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zip</th>
                        <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--navy-500)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tracking</th>
                        <th style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--navy-500)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                        <th style={{ padding: '5px 6px', width: 36 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((d, i) => {
                        const isPending   = d.status === 'pending';
                        const isFailed    = d.status === 'failed';
                        const isGenerated = d.status === 'generated';
                        const statusColor = isPending ? '#92400E' : isFailed ? '#DC2626' : '#15803D';
                        const statusBg    = isPending ? '#FFFBEB' : isFailed ? '#FFF5F5' : '#F0FDF4';
                        const statusBorder= isPending ? '#FDE68A' : isFailed ? '#FECACA' : '#BBF7D0';
                        return (
                          <tr key={d._id} style={{ borderBottom: '1px solid var(--navy-50)' }}>
                            <td style={{ padding: '5px 10px', color: 'var(--navy-400)', fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: '5px 10px', color: 'var(--navy-800)', fontWeight: 600, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.to_name || '—'}
                              {d.to_city && <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}> · {d.to_city}, {d.to_state}</span>}
                            </td>
                            <td style={{ padding: '5px 10px', color: 'var(--navy-600)', fontFamily: 'monospace' }}>{d.to_zip || '—'}</td>
                            <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: '0.7rem', color: d.trackingId ? 'var(--navy-700)' : 'var(--navy-300)' }}>
                              {d.trackingId || (isPending ? '…' : '—')}
                            </td>
                            <td style={{ padding: '5px 10px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`, borderRadius: 20, padding: '2px 7px', fontSize: '0.6rem', fontWeight: 700 }}>
                                {isPending && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#F59E0B', animation: 'bl-pulse 1.2s ease-in-out infinite' }} />}
                                {d.status}
                              </span>
                            </td>
                            <td style={{ padding: '5px 6px' }}>
                              <button
                                disabled={!d.pdfUrl && !isGenerated}
                                title={d.pdfUrl ? 'Download PDF' : 'No PDF yet'}
                                onClick={async () => {
                                  if (!d.pdfUrl && !isGenerated) return;
                                  try {
                                    const r = await axios.get(`labels/${d._id}/pdf`, { responseType: 'blob' });
                                    const u = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
                                    const a = document.createElement('a');
                                    a.href = u; a.download = `${d.trackingId || d._id}.pdf`;
                                    document.body.appendChild(a); a.click(); a.remove();
                                    window.URL.revokeObjectURL(u);
                                  } catch { alert('PDF not available yet.'); }
                                }}
                                style={{
                                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  border: `1px solid ${d.pdfUrl || isGenerated ? '#6366F1' : 'var(--navy-200)'}`,
                                  borderRadius: 6, cursor: d.pdfUrl || isGenerated ? 'pointer' : 'not-allowed',
                                  background: 'transparent', color: d.pdfUrl || isGenerated ? '#6366F1' : 'var(--navy-300)',
                                  transition: 'all 0.12s', flexShrink: 0,
                                }}
                              >
                                <ArrowDownTrayIcon style={{ width: 11, height: 11 }} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!detailLoad && details && details.length === 0 && (
                <div style={{ fontFamily: FONT, fontSize: '0.72rem', color: 'var(--navy-300)' }}>No label detail available.</div>
              )}
            </div>

            {/* Tracking batches */}
            {validIds.length > 0 && (
              <div>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <TruckIcon style={{ width: 11, height: 11 }} />
                  Track Shipments · {validIds.length} IDs in {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {batches.map((batch, ci) => {
                    const start = ci * BATCH_SIZE + 1;
                    const end   = start + batch.length - 1;
                    return (
                      <a
                        key={ci}
                        href={getTrackUrl(job.carrier, batch)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: theme.bg, color: theme.color,
                          border: `1.5px solid ${theme.border}`, borderRadius: 8,
                          padding: '5px 12px', fontSize: '0.7rem', fontWeight: 700,
                          textDecoration: 'none', fontFamily: FONT, whiteSpace: 'nowrap',
                          transition: 'filter 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.9)')}
                        onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                      >
                        <TruckIcon style={{ width: 11, height: 11, flexShrink: 0 }} />
                        Batch {ci + 1}
                        <span style={{ opacity: 0.6 }}>#{start}–{end}</span>
                        <ArrowTopRightOnSquareIcon style={{ width: 10, height: 10, flexShrink: 0 }} />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const BulkLabels: React.FC = () => {
  const [jobs,        setJobs]        = useState<BulkJob[]>([]);
  const [vendors,     setVendors]     = useState<Vendor[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);
  const [totalPages,  setTotalPages]  = useState(1);
  const [totalCount,  setTotalCount]  = useState(0);

  // filters
  const [search,         setSearch]         = useState('');
  const [carrier,        setCarrier]        = useState('');
  const [vendorId,       setVendorId]       = useState('');
  const [portal,         setPortal]         = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  // UI
  const [downloading,  setDownloading]  = useState<string | null>(null);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  const LIMIT = 15;
  const filteredVendors = carrier ? vendors.filter(v => v.carrier === carrier) : vendors;
  const hasFilters      = !!(carrier || vendorId || portal || dateFrom || dateTo || search);

  const pageLabels     = jobs.reduce((s, j) => s + j.totalLabels, 0);
  const pageGenerated  = jobs.reduce((s, j) => s + j.generatedCount, 0);
  const pageSpend      = jobs.reduce((s, j) => s + (j.totalPrice || 0), 0);
  const pageSuccessRate = pageLabels > 0 ? Math.round((pageGenerated / pageLabels) * 100) : 0;

  useEffect(() => {
    axios.get('/vendors').then(r => setVendors(r.data.vendors || [])).catch(() => {});
  }, []);

  const fetchJobs = useCallback(async (p = 1) => {
    setLoading(true);
    setExpandedId(null);
    try {
      const params: Record<string, string> = { page: String(p), limit: String(LIMIT) };
      if (search)   params.search   = search;
      if (carrier)  params.carrier  = carrier;
      if (vendorId) params.vendorId = vendorId;
      if (portal)   params.portal   = portal;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo)   params.dateTo   = dateTo;
      const res = await axios.get('/labels/bulk-jobs', { params });
      setJobs(res.data.jobs || []);
      setTotalPages(res.data.totalPages || 1);
      setTotalCount(res.data.total || 0);
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, carrier, vendorId, portal, dateFrom, dateTo]);

  useEffect(() => { fetchJobs(1); }, [fetchJobs]);

  const handleDownloadZip = async (job: BulkJob) => {
    setDownloading(job._id);
    const filename = (job.bulkFileName || job._id).replace(/\.[^.]+$/, '') + '.zip';
    try {
      // Always go through the bulk-job-id endpoint — it serves the pre-built ZIP
      // when present, and rebuilds it live from the labels' PDFs otherwise. The
      // pre-built ZIP file itself lives on ephemeral local disk and can be gone
      // after a redeploy, so hitting it directly (via bulkZipUrl) has no fallback.
      await downloadFile(`labels/zip/bulk/${job._id}`, filename);
    } finally { setDownloading(null); }
  };

  const resetFilters = () => {
    setCarrier(''); setVendorId(''); setPortal('');
    setDateFrom(''); setDateTo(''); setSearch('');
    setShowDateFilter(false);
  };

  const pageNums = (() => {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) range.push(i);
    if (range[0] > 1)                         { range.unshift(-1); range.unshift(1); }
    if (range[range.length - 1] < totalPages) { range.push(-2); range.push(totalPages); }
    return range;
  })();

  const CARRIER_TABS = [
    { key: '', label: 'All Carriers' },
    ...CARRIERS.map(c => ({ key: c, label: c })),
  ];
  const PORTAL_TABS = [
    { id: '', label: 'All' },
    ...PORTALS,
  ];

  return (
    <>
      <style>{`
        @keyframes bl-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes bl-spin    { to { transform: rotate(360deg); } }
        @keyframes bl-in      { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes bl-pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .bl-card-in { animation: bl-in 0.22s ease both; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: FONT }}>

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
          borderRadius: 18, padding: '1.3rem 1.8rem',
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.05, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '-40%', right: '10%', width: 220, height: 220, background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <RectangleStackIcon style={{ width: 22, height: 22, color: '#818CF8' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1, fontFamily: FONT }}>
                Bulk Labels
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: '0.73rem', color: 'rgba(148,163,184,0.7)', fontFamily: FONT }}>
                {loading ? 'Loading…' : `Showing ${jobs.length} of ${totalCount} bulk jobs`}
                {hasFilters && <span style={{ marginLeft: 6, color: '#818CF8' }}>· filtered</span>}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            {([
              { label: 'Total Jobs',   value: totalCount.toLocaleString(),      sub: 'all pages' },
              { label: 'Labels',       value: pageLabels.toLocaleString(),       sub: 'this page' },
              { label: 'Spent',        value: `$${pageSpend.toFixed(2)}`,        sub: 'this page' },
              { label: 'Success',      value: pageLabels > 0 ? `${pageSuccessRate}%` : '—', sub: 'rate' },
            ] as const).map(({ label, value, sub }) => (
              <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.45rem 0.85rem', minWidth: 68 }}>
                <div style={{ fontSize: '0.57rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, fontFamily: FONT }}>{label}</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#818CF8', letterSpacing: '-0.02em', fontFamily: FONT, margin: '2px 0 1px' }}>{value}</div>
                <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)', fontFamily: FONT }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Filter bar ─────────────────────────────────────────────────────── */}
        <div className="db-card" style={{ overflow: 'hidden' }}>

          {/* Row 1: Search + Vendor + Date + Clear */}
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--navy-100)' }}>
            <div style={{ flex: 1, position: 'relative', minWidth: 160 }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)', pointerEvents: 'none' }} />
              <input
                type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchJobs(1)}
                placeholder="Search file name, user…"
                style={{ width: '100%', boxSizing: 'border-box', height: 34, paddingLeft: 32, paddingRight: 10, border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--navy-800)', outline: 'none', background: 'var(--navy-50)', fontFamily: FONT, transition: 'border-color 0.15s' }}
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = 'var(--navy-200)')}
              />
            </div>

            {filteredVendors.length > 0 && (
              <select
                value={vendorId} onChange={e => { setVendorId(e.target.value); fetchJobs(1); }}
                style={{ height: 34, paddingLeft: 10, paddingRight: 28, border: '1.5px solid var(--navy-200)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--navy-700)', background: 'var(--navy-50)', cursor: 'pointer', outline: 'none', fontFamily: FONT, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394A3B8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 16 }}>
                <option value="">All Vendors</option>
                {filteredVendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            )}

            <button
              onClick={() => setShowDateFilter(o => !o)}
              style={{ height: 34, display: 'flex', alignItems: 'center', gap: 5, padding: '0 11px', border: `1.5px solid ${showDateFilter || dateFrom || dateTo ? '#6366f1' : 'var(--navy-200)'}`, borderRadius: 8, background: showDateFilter || dateFrom || dateTo ? '#EEF2FF' : 'var(--navy-50)', color: showDateFilter || dateFrom || dateTo ? '#4F46E5' : 'var(--navy-500)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              <CalendarDaysIcon style={{ width: 13, height: 13 }} />
              Date
              {(dateFrom || dateTo) && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />}
            </button>

            {hasFilters && (
              <button
                onClick={resetFilters}
                style={{ height: 34, display: 'flex', alignItems: 'center', gap: 5, padding: '0 11px', border: '1.5px solid #FCA5A5', borderRadius: 8, background: '#FFF5F5', color: '#DC2626', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                <XMarkIcon style={{ width: 12, height: 12 }} />
                Clear
              </button>
            )}
          </div>

          {/* Row 2: Carrier + Portal chips */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.9rem', overflowX: 'auto', borderBottom: showDateFilter ? '1px solid var(--navy-100)' : 'none' }}>

            {/* Carrier tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
              {CARRIER_TABS.map(tab => {
                const active = carrier === tab.key;
                const th = tab.key ? CC[tab.key] : null;
                return (
                  <button
                    key={tab.key || 'all'}
                    onClick={() => { setCarrier(tab.key); setVendorId(''); fetchJobs(1); }}
                    style={{
                      padding: '0.5rem 0.8rem', border: 'none', background: 'transparent',
                      fontSize: '0.74rem', fontWeight: active ? 700 : 500,
                      color: active ? (th?.color ?? '#4F46E5') : 'var(--navy-500)',
                      borderBottom: `2px solid ${active ? (th?.accent ?? '#6366F1') : 'transparent'}`,
                      cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT,
                      transition: 'all 0.15s', marginBottom: -1,
                    }}>
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: 'var(--navy-200)', margin: '0 0.5rem', flexShrink: 0 }} />

            {/* Portal chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: '0.5rem 0' }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, whiteSpace: 'nowrap' }}>Portal</span>
              {PORTAL_TABS.map(p => {
                const active = portal === p.id;
                const cfg = p.id ? PORTALS.find(x => x.id === p.id) : null;
                return (
                  <button
                    key={p.id || 'all'}
                    onClick={() => { setPortal(p.id); fetchJobs(1); }}
                    style={{
                      padding: '3px 10px', border: `1.5px solid ${active ? (cfg?.border ?? '#6366F1') : 'var(--navy-200)'}`,
                      borderRadius: 20, background: active ? (cfg?.bg ?? '#EEF2FF') : 'transparent',
                      color: active ? (cfg?.color ?? '#4F46E5') : 'var(--navy-500)',
                      fontSize: '0.7rem', fontWeight: active ? 700 : 500,
                      cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT, transition: 'all 0.15s',
                    }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range row */}
          {showDateFilter && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0.6rem 0.9rem', background: 'var(--navy-50)' }}>
              <CalendarDaysIcon style={{ width: 13, height: 13, color: 'var(--navy-400)', flexShrink: 0 }} />
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--navy-500)', fontFamily: FONT }}>From</label>
              <input type="date" value={dateFrom} max={dateTo || undefined}
                onChange={e => { setDateFrom(e.target.value); fetchJobs(1); }}
                style={{ height: 30, padding: '0 8px', border: '1.5px solid var(--navy-200)', borderRadius: 7, fontSize: '0.75rem', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none', fontFamily: FONT }} />
              <ArrowRightIcon style={{ width: 11, height: 11, color: 'var(--navy-300)' }} />
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--navy-500)', fontFamily: FONT }}>To</label>
              <input type="date" value={dateTo} min={dateFrom || undefined}
                onChange={e => { setDateTo(e.target.value); fetchJobs(1); }}
                style={{ height: 30, padding: '0 8px', border: '1.5px solid var(--navy-200)', borderRadius: 7, fontSize: '0.75rem', color: 'var(--navy-800)', background: 'var(--bg-card)', outline: 'none', fontFamily: FONT }} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex', padding: 2 }}>
                  <XMarkIcon style={{ width: 12, height: 12 }} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Job list ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} delay={i * 60} />)
          ) : jobs.length === 0 ? (
            <div className="db-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <RectangleStackIcon style={{ width: 24, height: 24, color: 'var(--navy-300)' }} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--navy-700)', fontSize: '0.92rem', fontFamily: FONT }}>No bulk jobs found</h3>
              <p style={{ margin: '0 0 16px', color: 'var(--navy-400)', fontSize: '0.78rem', fontFamily: FONT }}>
                {hasFilters ? 'Try adjusting or clearing your filters.' : 'Upload a bulk label sheet to get started.'}
              </p>
              {hasFilters && (
                <button onClick={resetFilters} className="btn btn-primary" style={{ fontFamily: FONT }}>
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            jobs.map((job, idx) => (
              <div key={job._id} className="bl-card-in" style={{ animationDelay: `${idx * 35}ms` }}>
                <JobCard
                  job={job}
                  rowNum={(page - 1) * LIMIT + idx + 1}
                  isExpanded={expandedId === job._id}
                  onToggle={() => setExpandedId(prev => prev === job._id ? null : job._id)}
                  downloading={downloading}
                  onDownload={() => handleDownloadZip(job)}
                />
              </div>
            ))
          )}
        </div>

        {/* ── Pagination ─────────────────────────────────────────────────────── */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontFamily: FONT }}>
              Showing <strong style={{ color: 'var(--navy-600)' }}>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, totalCount)}</strong> of <strong style={{ color: 'var(--navy-600)' }}>{totalCount}</strong> jobs
            </span>

            <div style={{ display: 'flex', gap: 3 }}>
              <button
                disabled={page <= 1} onClick={() => fetchJobs(page - 1)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--navy-200)', borderRadius: 7, background: page <= 1 ? 'var(--navy-50)' : 'var(--bg-card)', color: page <= 1 ? 'var(--navy-300)' : 'var(--navy-600)', cursor: page <= 1 ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                <ChevronLeftIcon style={{ width: 13, height: 13 }} />
              </button>

              {pageNums.map((n, i) =>
                n < 0 ? (
                  <span key={i} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--navy-300)', fontFamily: FONT }}>…</span>
                ) : (
                  <button
                    key={n} onClick={() => fetchJobs(n)}
                    style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${n === page ? '#6366F1' : 'var(--navy-200)'}`, borderRadius: 7, background: n === page ? '#6366F1' : 'var(--bg-card)', color: n === page ? '#fff' : 'var(--navy-600)', fontSize: '0.75rem', fontWeight: n === page ? 700 : 500, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s' }}>
                    {n}
                  </button>
                )
              )}

              <button
                disabled={page >= totalPages} onClick={() => fetchJobs(page + 1)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--navy-200)', borderRadius: 7, background: page >= totalPages ? 'var(--navy-50)' : 'var(--bg-card)', color: page >= totalPages ? 'var(--navy-300)' : 'var(--navy-600)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                <ChevronRightIcon style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default BulkLabels;
