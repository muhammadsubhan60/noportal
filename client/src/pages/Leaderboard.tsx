import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  TrophyIcon, PlusIcon, PencilIcon, TrashIcon,
  XMarkIcon, CheckCircleIcon, ExclamationCircleIcon,
  EyeIcon, EyeSlashIcon, ChevronUpIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Entry {
  _id: string;
  vendorName: string;
  portal: 'shippershub' | 'labelcrow' | 'shiplabel';
  carrier: string;
  shippingService: string;
  successRate: number;
  totalLabels: number;
  isVisible: boolean;
  vendor?: string | null;
}

interface VendorOption {
  _id: string;
  name: string;
  carrier: string;
  shippingService: string;
  source: string;
}

// ── Config ─────────────────────────────────────────────────────────────────────
const PORTAL_CFG = {
  shippershub: { label: 'ShippersHub', accent: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  labelcrow:   { label: 'Label Crow',  accent: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  shiplabel:   { label: 'ShipLabel',   accent: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
};

const RANK_STYLE: Record<number, { color: string; bg: string; border: string; label: string }> = {
  1: { color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', label: 'Gold'   },
  2: { color: '#475569', bg: '#F8FAFC', border: '#CBD5E1', label: 'Silver' },
  3: { color: '#7C3500', bg: '#FFF7ED', border: '#FDBA74', label: 'Bronze' },
};

const BLANK_FORM = {
  vendorId: '', vendorName: '',
  portal: 'shippershub' as Entry['portal'],
  carrier: 'USPS', shippingService: '',
  successRate: '', totalLabels: '', isVisible: true,
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
function rateColor(r: number) {
  if (r >= 90) return '#059669';
  if (r >= 70) return '#D97706';
  return '#DC2626';
}
function rateBarBg(r: number) {
  if (r >= 90) return 'linear-gradient(90deg,#10B981,#34D399)';
  if (r >= 70) return 'linear-gradient(90deg,#F59E0B,#FCD34D)';
  return 'linear-gradient(90deg,#EF4444,#F87171)';
}

// ── Shared label ───────────────────────────────────────────────────────────────
const SLabel = ({ text, accent = 'var(--accent-500)' }: { text: string; accent?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <div style={{ width: 3, height: 13, borderRadius: 3, background: accent, flexShrink: 0 }} />
    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>
      {text}
    </span>
  </div>
);

// ── Rate bar ───────────────────────────────────────────────────────────────────
const RateBar = ({ rate, width = 100 }: { rate: number; width?: number }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, width }}>
    <div style={{ flex: 1, height: 4, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ width: `${rate}%`, height: '100%', background: rateBarBg(rate), borderRadius: 99, transition: 'width 0.5s ease' }} />
    </div>
    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: rateColor(rate), minWidth: 42, textAlign: 'right', fontFamily: FONT, letterSpacing: '-0.02em' }}>
      {rate}%
    </span>
  </div>
);

// ── Admin icon button ──────────────────────────────────────────────────────────
const IconBtn = ({ onClick, title, children, danger }: {
  onClick: () => void; title: string; children: React.ReactNode; danger?: boolean;
}) => (
  <button
    onClick={onClick} title={title}
    style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px',
      borderRadius: 6, display: 'flex', alignItems: 'center',
      color: danger ? 'var(--danger-500)' : 'var(--navy-400)',
      transition: 'color 0.12s, background 0.12s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = danger ? '#FEF2F2' : 'var(--navy-50)'; (e.currentTarget as HTMLButtonElement).style.color = danger ? '#DC2626' : 'var(--navy-700)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = danger ? 'var(--danger-500)' : 'var(--navy-400)'; }}
  >
    {children}
  </button>
);

// ── Top-3 featured card ────────────────────────────────────────────────────────
const FeaturedRow = ({ entry, rank, isAdmin, portalLabels, onEdit, onDelete, onToggle }: {
  entry: Entry; rank: number; isAdmin: boolean; portalLabels: Record<string, string>;
  onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) => {
  const rs = RANK_STYLE[rank];
  const portal = PORTAL_CFG[entry.portal];
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '1.25rem',
        padding: '1.1rem 1.4rem',
        background: 'var(--bg-card)',
        border: `1px solid ${rank === 1 ? '#FDE68A' : 'var(--navy-150, #e8edf5)'}`,
        borderLeft: `3px solid ${rs.color}`,
        borderRadius: 14,
        opacity: entry.isVisible ? 1 : 0.45,
        transition: 'box-shadow 0.15s',
        boxShadow: hov ? 'var(--shadow-lg)' : rank === 1 ? '0 4px 16px rgba(245,158,11,0.1)' : 'var(--shadow-card)',
        fontFamily: FONT,
      }}
    >
      {/* Rank number */}
      <div style={{
        width: 44, height: 44, borderRadius: 11, flexShrink: 0,
        background: rs.bg, border: `1px solid ${rs.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '1rem', fontWeight: 900, color: rs.color, letterSpacing: '-0.04em', lineHeight: 1 }}>
          0{rank}
        </span>
      </div>

      {/* Vendor info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--navy-900)', letterSpacing: '-0.01em' }}>
            {entry.vendorName}
          </span>
          <span style={{
            fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
            background: portal.bg, color: portal.accent, border: `1px solid ${portal.border}`,
            letterSpacing: '0.03em',
          }}>
            {portalLabels[entry.portal] || portal.label}
          </span>
          {!entry.isVisible && isAdmin && (
            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--navy-100)', color: 'var(--navy-400)' }}>Hidden</span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>
          {entry.carrier}{entry.shippingService ? ` · ${entry.shippingService}` : ''}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem', flexShrink: 0 }}>
        {entry.totalLabels > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--navy-800)', letterSpacing: '-0.02em' }}>
              {entry.totalLabels.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginTop: 1 }}>Labels</div>
          </div>
        )}
        <RateBar rate={entry.successRate} width={160} />
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <IconBtn onClick={onToggle} title={entry.isVisible ? 'Hide' : 'Show'}>
            {entry.isVisible
              ? <EyeIcon style={{ width: 14, height: 14, color: '#059669' }} />
              : <EyeSlashIcon style={{ width: 14, height: 14 }} />}
          </IconBtn>
          <IconBtn onClick={onEdit} title="Edit"><PencilIcon style={{ width: 13, height: 13 }} /></IconBtn>
          <IconBtn onClick={onDelete} title="Delete" danger><TrashIcon style={{ width: 13, height: 13 }} /></IconBtn>
        </div>
      )}
    </div>
  );
};

// ── Regular rank row ───────────────────────────────────────────────────────────
const RankRow = ({ entry, rank, isAdmin, portalLabels, onEdit, onDelete, onToggle, delay }: {
  entry: Entry; rank: number; isAdmin: boolean; portalLabels: Record<string, string>;
  onEdit: () => void; onDelete: () => void; onToggle: () => void; delay?: number;
}) => {
  const [hov, setHov] = useState(false);
  const portal = PORTAL_CFG[entry.portal];

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.75rem 1.2rem',
        background: hov ? 'var(--navy-50)' : 'transparent',
        borderBottom: '1px solid var(--navy-50)',
        opacity: entry.isVisible ? 1 : 0.45,
        transition: 'background 0.12s',
        fontFamily: FONT,
      }}
    >
      {/* Rank */}
      <div style={{ width: 32, flexShrink: 0, textAlign: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '-0.01em' }}>
        {rank}
      </div>

      {/* Initials monogram */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: 'var(--navy-100)', color: 'var(--navy-500)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.02em',
      }}>
        {getInitials(entry.vendorName)}
      </div>

      {/* Name + service */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.vendorName}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 1 }}>
          {entry.carrier}{entry.shippingService ? ` · ${entry.shippingService}` : ''}
        </div>
      </div>

      {/* Portal badge */}
      <span style={{
        fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0,
        background: portal.bg, color: portal.accent, border: `1px solid ${portal.border}`,
      }}>
        {portalLabels[entry.portal] || portal.label}
      </span>

      {/* Rate bar */}
      <div style={{ flexShrink: 0 }}>
        <RateBar rate={entry.successRate} width={150} />
      </div>

      {/* Labels */}
      <div style={{ flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
        {entry.totalLabels > 0
          ? <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--navy-700)' }}>{entry.totalLabels.toLocaleString()}</span>
          : <span style={{ color: 'var(--navy-300)', fontSize: '0.78rem' }}>—</span>}
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
          <IconBtn onClick={onToggle} title={entry.isVisible ? 'Hide' : 'Show'}>
            {entry.isVisible
              ? <EyeIcon style={{ width: 13, height: 13, color: '#059669' }} />
              : <EyeSlashIcon style={{ width: 13, height: 13 }} />}
          </IconBtn>
          <IconBtn onClick={onEdit} title="Edit"><PencilIcon style={{ width: 12, height: 12 }} /></IconBtn>
          <IconBtn onClick={onDelete} title="Delete" danger><TrashIcon style={{ width: 12, height: 12 }} /></IconBtn>
        </div>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const Leaderboard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [entries,      setEntries]      = useState<Entry[]>([]);
  // Reseller white-label portal names — defaults to the raw brand until the fetch
  // resolves (matches the fallback behavior itself, so there's no flash to fix).
  const [portalLabels, setPortalLabels] = useState<Record<string, string>>({
    shippershub: PORTAL_CFG.shippershub.label,
    labelcrow:   PORTAL_CFG.labelcrow.label,
    shiplabel:   PORTAL_CFG.shiplabel.label,
  });
  const [loading,      setLoading]      = useState(true);
  const [filterPortal, setFilterPortal] = useState<Entry['portal'] | 'all'>('all');
  const [showModal,    setShowModal]    = useState(false);
  const [editEntry,    setEditEntry]    = useState<Entry | null>(null);
  const [form,         setForm]         = useState({ ...BLANK_FORM });
  const [vendorOpts,   setVendorOpts]   = useState<VendorOption[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState<{ msg: string; err?: boolean } | null>(null);

  const notify = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await axios.get(isAdmin ? '/leaderboard/all' : '/leaderboard');
      setEntries(res.data.entries || []);
      if (res.data.portalLabels) setPortalLabels(res.data.portalLabels);
    } catch {}
    finally { setLoading(false); }
  };

  const fetchVendorOpts = async () => {
    try {
      const res = await axios.get('/leaderboard/vendors');
      setVendorOpts(res.data.vendors || []);
    } catch {}
  };

  useEffect(() => {
    fetchEntries();
    if (isAdmin) fetchVendorOpts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVendorPick = (vendorId: string) => {
    const v = vendorOpts.find(x => x._id === vendorId);
    if (!v) { setForm(f => ({ ...f, vendorId: '', vendorName: '', portal: 'shippershub', carrier: 'USPS', shippingService: '' })); return; }
    const portal = (v.source === 'labelcrow' ? 'labelcrow' : v.source === 'shiplabel' ? 'shiplabel' : 'shippershub') as Entry['portal'];
    setForm(f => ({ ...f, vendorId, vendorName: v.name, portal, carrier: v.carrier, shippingService: v.shippingService || '' }));
  };

  const openAdd  = () => { setEditEntry(null); setForm({ ...BLANK_FORM }); setShowModal(true); };
  const openEdit = (e: Entry) => {
    setEditEntry(e);
    setForm({ vendorId: e.vendor || '', vendorName: e.vendorName, portal: e.portal, carrier: e.carrier, shippingService: e.shippingService, successRate: String(e.successRate), totalLabels: String(e.totalLabels), isVisible: e.isVisible });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vendorName.trim() || !form.successRate) { notify('Vendor name and success rate are required', true); return; }
    const rate = parseFloat(form.successRate);
    if (isNaN(rate) || rate < 0 || rate > 100) { notify('Success rate must be 0–100', true); return; }
    setSaving(true);
    try {
      const payload = { vendorName: form.vendorName.trim(), portal: form.portal, carrier: form.carrier || 'USPS', shippingService: form.shippingService, successRate: rate, totalLabels: parseInt(form.totalLabels) || 0, isVisible: form.isVisible, vendorId: form.vendorId || null };
      if (editEntry) await axios.put(`/leaderboard/${editEntry._id}`, payload);
      else           await axios.post('/leaderboard', payload);
      notify(editEntry ? 'Entry updated' : 'Entry added');
      setShowModal(false);
      fetchEntries();
    } catch (err: any) { notify(err.response?.data?.message || 'Save failed', true); }
    finally { setSaving(false); }
  };

  const handleDelete = async (e: Entry) => {
    if (!window.confirm(`Remove "${e.vendorName}" from the leaderboard?`)) return;
    try { await axios.delete(`/leaderboard/${e._id}`); notify('Entry removed'); fetchEntries(); }
    catch (err: any) { notify(err.response?.data?.message || 'Delete failed', true); }
  };

  const handleToggle = async (e: Entry) => {
    try { await axios.put(`/leaderboard/${e._id}`, { isVisible: !e.isVisible }); fetchEntries(); }
    catch { notify('Update failed', true); }
  };

  const sorted = entries
    .filter(e => filterPortal === 'all' || e.portal === filterPortal)
    .sort((a, b) => b.successRate - a.successRate || b.totalLabels - a.totalLabels);

  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const totalVisible = entries.filter(e => e.isVisible).length;
  const portalCounts = (['shippershub', 'labelcrow', 'shiplabel'] as const).reduce((acc, p) => {
    acc[p] = entries.filter(e => e.portal === p && e.isVisible).length;
    return acc;
  }, {} as Record<string, number>);

  const avgRate = entries.length > 0
    ? (entries.reduce((s, e) => s + e.successRate, 0) / entries.length).toFixed(1)
    : '—';

  return (
    <>
      <style>{`
        @keyframes lb-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .lb-row { animation: lb-in 0.25s ease both; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: FONT }} className="animate-fadeIn">

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
          borderRadius: 18, padding: '1.4rem 2rem',
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '-40%', right: '-5%', width: 240, height: 240, background: 'radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TrophyIcon style={{ width: 22, height: 22, color: '#F59E0B' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                Performance Rankings
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'rgba(148,163,184,0.65)' }}>
                Vendor success rates — curated by the platform team
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
            {[
              { label: 'Vendors',  value: totalVisible },
              { label: 'Avg Rate', value: `${avgRate}%` },
              { label: 'Portals',  value: 3 },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '0.5rem 0.9rem', minWidth: 64 }}>
                <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#F59E0B', letterSpacing: '-0.02em' }}>{value}</div>
              </div>
            ))}
            {isAdmin && (
              <button className="btn btn-primary" onClick={openAdd} style={{ flexShrink: 0, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5 }}>
                <PlusIcon style={{ width: 14, height: 14 }} /> Add Entry
              </button>
            )}
          </div>
        </div>

        {/* ── Toast ──────────────────────────────────────────────────────────── */}
        {toast && (
          <div className={`alert ${toast.err ? 'alert-danger' : 'alert-success'}`} style={{ padding: '0.55rem 0.9rem' }}>
            {toast.err ? <ExclamationCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} /> : <CheckCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} />}
            <span style={{ fontSize: '0.8rem', fontFamily: FONT }}>{toast.msg}</span>
          </div>
        )}

        {/* ── Portal filter tabs ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 3, background: 'var(--navy-100)', padding: 3, borderRadius: 11, overflowX: 'auto' }}>
          {([
            { key: 'all',         label: 'All Portals',           count: totalVisible,              accent: 'var(--navy-900)' },
            { key: 'shippershub', label: portalLabels.shippershub, count: portalCounts.shippershub, accent: PORTAL_CFG.shippershub.accent },
            { key: 'labelcrow',   label: portalLabels.labelcrow,   count: portalCounts.labelcrow,   accent: PORTAL_CFG.labelcrow.accent },
            { key: 'shiplabel',   label: portalLabels.shiplabel,   count: portalCounts.shiplabel,   accent: PORTAL_CFG.shiplabel.accent },
          ] as const).map(tab => {
            const active = filterPortal === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterPortal(tab.key as typeof filterPortal)}
                style={{
                  flex: '1 0 auto', padding: '0.45rem 0.9rem', borderRadius: 8,
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: active ? 'var(--bg-card)' : 'transparent',
                  color: active ? tab.accent : 'var(--navy-500)',
                  fontWeight: active ? 700 : 600, fontSize: '0.78rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s', fontFamily: FONT,
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: '0.63rem', fontWeight: 700, lineHeight: 1,
                  background: active ? `${tab.accent}18` : 'rgba(0,0,0,0.06)',
                  color: active ? tab.accent : 'var(--navy-400)',
                  padding: '2px 6px', borderRadius: 99,
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="db-card" style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <div className="spinner" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="db-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <TrophyIcon style={{ width: 36, height: 36, color: 'var(--navy-300)', margin: '0 auto 12px' }} />
            <h3 style={{ fontWeight: 700, color: 'var(--navy-700)', margin: '0 0 6px', fontFamily: FONT }}>No rankings yet</h3>
            <p style={{ color: 'var(--navy-400)', fontSize: '0.82rem', margin: 0, fontFamily: FONT }}>
              {isAdmin ? 'Click Add Entry to set up the first vendor ranking.' : 'Check back soon — rankings are being set up.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Top performers */}
            {top3.length > 0 && (
              <div className="db-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '0.8rem 1.4rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SLabel text="Top Performers" accent="#F59E0B" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ChevronUpIcon style={{ width: 12, height: 12, color: '#059669' }} />
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#059669', fontFamily: FONT }}>Ranked by success rate</span>
                  </div>
                </div>
                <div style={{ padding: '0.85rem 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {top3.map((e, i) => (
                    <div key={e._id} className="lb-row" style={{ padding: '0 0.85rem', animationDelay: `${i * 50}ms` }}>
                      <FeaturedRow
                        entry={e} rank={i + 1} isAdmin={isAdmin} portalLabels={portalLabels}
                        onEdit={() => openEdit(e)}
                        onDelete={() => handleDelete(e)}
                        onToggle={() => handleToggle(e)}
                      />
                      {i < top3.length - 1 && <div style={{ height: 6 }} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Remaining ranks */}
            {rest.length > 0 && (
              <div className="db-card" style={{ overflow: 'hidden' }}>
                {/* Column headers */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1.2rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-50)' }}>
                  <div style={{ width: 32, fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>#</div>
                  <div style={{ width: 32 }} />
                  <div style={{ flex: 1, fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vendor</div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 70 }}>Portal</div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', width: 150 }}>Success Rate</div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 60, textAlign: 'right' }}>Labels</div>
                  {isAdmin && <div style={{ width: 72 }} />}
                </div>

                {rest.map((e, i) => (
                  <div key={e._id} className="lb-row" style={{ animationDelay: `${(i + top3.length) * 35}ms` }}>
                    <RankRow
                      entry={e} rank={i + 4} isAdmin={isAdmin} portalLabels={portalLabels} delay={i * 35}
                      onEdit={() => openEdit(e)}
                      onDelete={() => handleDelete(e)}
                      onToggle={() => handleToggle(e)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        {!isAdmin && entries.length > 0 && (
          <p style={{ fontSize: '0.7rem', color: 'var(--navy-400)', textAlign: 'center', margin: 0, fontFamily: FONT }}>
            Rankings reflect real-world performance data and are curated by the platform team.
          </p>
        )}
      </div>

      {/* ── Add / Edit modal ───────────────────────────────────────────────────── */}
      {showModal && (
        <div
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
          <div className="db-card" style={{ width: '100%', maxWidth: 480, padding: '1.6rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>
                {editEntry ? 'Edit Entry' : 'Add Leaderboard Entry'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'var(--navy-100)', border: '1px solid var(--navy-200)', cursor: 'pointer', color: 'var(--navy-500)', padding: 5, borderRadius: 8, display: 'flex' }}>
                <XMarkIcon style={{ width: 15, height: 15 }} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

              {vendorOpts.length > 0 && (
                <div>
                  <label className="form-label" style={{ fontFamily: FONT }}>
                    Pick from existing vendors
                    <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}> — optional, auto-fills below</span>
                  </label>
                  <select className="form-input" value={form.vendorId} onChange={e => handleVendorPick(e.target.value)} style={{ fontFamily: FONT }}>
                    <option value="">— select a vendor —</option>
                    {(['shippershub', 'labelcrow', 'shiplabel'] as const).map(p => {
                      const group = vendorOpts.filter(v => (v.source === 'shippershub' && p === 'shippershub') || v.source === p);
                      if (!group.length) return null;
                      return (
                        <optgroup key={p} label={PORTAL_CFG[p].label}>
                          {group.map(v => <option key={v._id} value={v._id}>{v.name}{v.shippingService ? ` · ${v.shippingService}` : ''}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: '0.85rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ fontFamily: FONT }}>Display Name *</label>
                    <input className="form-input" value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} placeholder="e.g. USPS Ground Advantage (9201)" style={{ fontFamily: FONT }} />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontFamily: FONT }}>Portal *</label>
                    <select className="form-input" value={form.portal} onChange={e => setForm(f => ({ ...f, portal: e.target.value as Entry['portal'] }))} style={{ fontFamily: FONT }}>
                      <option value="shippershub">ShippersHub</option>
                      <option value="labelcrow">Label Crow</option>
                      <option value="shiplabel">ShipLabel</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontFamily: FONT }}>Carrier</label>
                    <input className="form-input" value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} placeholder="USPS" style={{ fontFamily: FONT }} />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontFamily: FONT }}>Success Rate (%) *</label>
                    <input className="form-input" type="number" min="0" max="100" step="0.1" value={form.successRate} onChange={e => setForm(f => ({ ...f, successRate: e.target.value }))} placeholder="e.g. 94.5" style={{ fontFamily: FONT }} />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontFamily: FONT }}>Total Labels</label>
                    <input className="form-input" type="number" min="0" value={form.totalLabels} onChange={e => setForm(f => ({ ...f, totalLabels: e.target.value }))} placeholder="e.g. 12000" style={{ fontFamily: FONT }} />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ fontFamily: FONT }}>Shipping Service</label>
                    <input className="form-input" value={form.shippingService} onChange={e => setForm(f => ({ ...f, shippingService: e.target.value }))} placeholder="e.g. Ground Advantage" style={{ fontFamily: FONT }} />
                  </div>
                </div>

                {/* Live rate preview */}
                {form.successRate && !isNaN(parseFloat(form.successRate)) && (
                  <div style={{ marginTop: '0.85rem', padding: '0.85rem 1rem', background: 'var(--navy-50)', borderRadius: 10, border: '1px solid var(--navy-100)' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>Rate Preview</div>
                    <RateBar rate={Math.min(parseFloat(form.successRate), 100)} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.85rem' }}>
                  <input type="checkbox" id="isVisible" checked={form.isVisible} onChange={e => setForm(f => ({ ...f, isVisible: e.target.checked }))} style={{ width: 14, height: 14, accentColor: 'var(--accent-600)', cursor: 'pointer' }} />
                  <label htmlFor="isVisible" style={{ fontSize: '0.8rem', color: 'var(--navy-700)', cursor: 'pointer', fontFamily: FONT }}>Visible to users</label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--navy-100)' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)} style={{ fontFamily: FONT }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontFamily: FONT }}>
                {saving ? 'Saving…' : editEntry ? 'Save Changes' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Leaderboard;
