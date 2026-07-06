import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  TrophyIcon, PlusIcon, PencilIcon, TrashIcon,
  XMarkIcon, CheckCircleIcon, ExclamationCircleIcon,
  EyeIcon, EyeSlashIcon, StarIcon,
} from '@heroicons/react/24/outline';
import { TrophyIcon as TrophySolid } from '@heroicons/react/24/solid';

// ── Types ──────────────────────────────────────────────────────
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

// ── Portal config ──────────────────────────────────────────────
const PORTAL_CFG = {
  shippershub: { label: 'ShippersHub', accent: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', light: '#DBEAFE' },
  labelcrow:   { label: 'Label Crow',  accent: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', light: '#EDE9FE' },
  shiplabel:   { label: 'ShipLabel',   accent: '#059669', bg: '#ECFDF5', border: '#A7F3D0', light: '#D1FAE5' },
};

const BLANK_FORM = {
  vendorId:        '',
  vendorName:      '',
  portal:          'shippershub' as Entry['portal'],
  carrier:         'USPS',
  shippingService: '',
  successRate:     '',
  totalLabels:     '',
  isVisible:       true,
};

// ── Helpers ────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function rateColor(r: number) {
  if (r >= 90) return '#059669';
  if (r >= 70) return '#D97706';
  return '#DC2626';
}

function rateBarColor(r: number) {
  if (r >= 90) return 'linear-gradient(90deg,#10B981,#34D399)';
  if (r >= 70) return 'linear-gradient(90deg,#F59E0B,#FCD34D)';
  return 'linear-gradient(90deg,#EF4444,#F87171)';
}

const RANK_MEDAL: Record<number, { emoji: string; label: string; color: string; glow: string }> = {
  1: { emoji: '🥇', label: '1st', color: '#B45309', glow: 'rgba(245,158,11,0.25)' },
  2: { emoji: '🥈', label: '2nd', color: '#475569', glow: 'rgba(148,163,184,0.25)' },
  3: { emoji: '🥉', label: '3rd', color: '#92400E', glow: 'rgba(180,83,9,0.2)'  },
};

// ── Modal ──────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div
    onClick={e => e.target === e.currentTarget && onClose()}
    style={{
      position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.55)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: '1rem',
    }}
  >
    <div className="sh-card" style={{ width: '100%', maxWidth: 480, padding: '1.75rem', maxHeight: '90vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy-900)' }}>{title}</h2>
        <button onClick={onClose} style={{ background: 'var(--navy-100)', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
          <XMarkIcon style={{ width: 16, height: 16 }} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ── Podium Card (top 3) ────────────────────────────────────────
const PodiumCard = ({ entry, rank }: { entry: Entry; rank: number }) => {
  const medal = RANK_MEDAL[rank];
  const initials = getInitials(entry.vendorName);
  const avatarColors = [
    ['#FEF3C7', '#B45309'],
    ['#E2E8F0', '#475569'],
    ['#FED7AA', '#92400E'],
  ];
  const [avatarBg, avatarFg] = avatarColors[rank - 1] ?? ['#EFF6FF', '#1D4ED8'];

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: rank === 1
        ? `0 0 0 2px #F59E0B40, 0 8px 24px -4px rgba(245,158,11,0.18), var(--shadow-md)`
        : 'var(--shadow-card)',
      border: rank === 1 ? '1.5px solid #FCD34D' : '1px solid rgba(0,0,0,0.06)',
      padding: '1.5rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.75rem',
      position: 'relative',
      overflow: 'hidden',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
    >
      {rank === 1 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg,#F59E0B,#FCD34D,#F59E0B)',
        }} />
      )}

      {/* Medal */}
      <div style={{ fontSize: '1.75rem', lineHeight: 1 }}>{medal.emoji}</div>

      {/* Avatar */}
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: avatarBg, color: avatarFg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: '1.1rem',
        boxShadow: `0 0 0 3px ${medal.glow}`,
      }}>
        {initials}
      </div>

      {/* Name */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--navy-900)', lineHeight: 1.3 }}>
          {entry.vendorName}
        </div>
        {entry.shippingService && (
          <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 2 }}>
            {entry.carrier} · {entry.shippingService}
          </div>
        )}
      </div>

      {/* Rate */}
      <div style={{
        fontSize: '2rem', fontWeight: 900,
        color: rateColor(entry.successRate),
        lineHeight: 1,
      }}>
        {entry.successRate}%
      </div>

      {/* Bar */}
      <div style={{ width: '100%', height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          width: `${entry.successRate}%`,
          background: rateBarColor(entry.successRate),
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>

      {/* Labels count */}
      {entry.totalLabels > 0 && (
        <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontWeight: 600 }}>
          {entry.totalLabels.toLocaleString()} labels
        </div>
      )}

      {/* Portal badge */}
      <div style={{
        padding: '3px 10px', borderRadius: 99, fontSize: '0.67rem', fontWeight: 800,
        background: PORTAL_CFG[entry.portal].bg,
        color: PORTAL_CFG[entry.portal].accent,
        border: `1.5px solid ${PORTAL_CFG[entry.portal].border}`,
      }}>
        {PORTAL_CFG[entry.portal].label}
      </div>
    </div>
  );
};

// ── Row Card (rank 4+) ─────────────────────────────────────────
const RowCard = ({
  entry, rank, isAdmin, onEdit, onDelete, onToggle,
}: {
  entry: Entry; rank: number; isAdmin: boolean;
  onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) => {
  const initials = getInitials(entry.vendorName);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1rem',
      padding: '0.875rem 1.25rem',
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)',
      border: '1px solid rgba(0,0,0,0.05)',
      opacity: entry.isVisible ? 1 : 0.5,
      transition: 'box-shadow 0.15s, transform 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)'; }}
    >
      {/* Rank */}
      <div style={{
        width: 36, flexShrink: 0, textAlign: 'center',
        fontWeight: 900, fontSize: '0.95rem', color: 'var(--navy-400)',
      }}>
        #{rank}
      </div>

      {/* Avatar */}
      <div style={{
        width: 38, height: 38, flexShrink: 0, borderRadius: '50%',
        background: 'var(--navy-100)', color: 'var(--navy-600)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: '0.8rem',
      }}>
        {initials}
      </div>

      {/* Name + service */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.vendorName}
        </div>
        {entry.shippingService && (
          <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>
            {entry.carrier} · {entry.shippingService}
          </div>
        )}
      </div>

      {/* Portal badge */}
      <div style={{ flexShrink: 0, display: 'none' }} className="lb-portal-badge">
        <span style={{
          padding: '3px 9px', borderRadius: 99, fontSize: '0.67rem', fontWeight: 800,
          background: PORTAL_CFG[entry.portal].bg,
          color: PORTAL_CFG[entry.portal].accent,
          border: `1.5px solid ${PORTAL_CFG[entry.portal].border}`,
          whiteSpace: 'nowrap',
        }}>
          {PORTAL_CFG[entry.portal].label}
        </span>
      </div>

      {/* Success rate */}
      <div style={{ flexShrink: 0, width: 120, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 5, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, width: `${entry.successRate}%`,
            background: rateBarColor(entry.successRate),
            transition: 'width 0.5s ease',
          }} />
        </div>
        <span style={{ fontWeight: 800, fontSize: '0.875rem', color: rateColor(entry.successRate), flexShrink: 0, minWidth: 40, textAlign: 'right' }}>
          {entry.successRate}%
        </span>
      </div>

      {/* Labels */}
      <div style={{ flexShrink: 0, minWidth: 64, textAlign: 'right' }}>
        {entry.totalLabels > 0 ? (
          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--navy-700)' }}>
            {entry.totalLabels.toLocaleString()}
          </span>
        ) : (
          <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>—</span>
        )}
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button onClick={onToggle}
            title={entry.isVisible ? 'Visible — click to hide' : 'Hidden — click to show'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, borderRadius: 6, color: entry.isVisible ? '#059669' : 'var(--navy-300)', display: 'flex', alignItems: 'center' }}>
            {entry.isVisible ? <EyeIcon style={{ width: 15, height: 15 }} /> : <EyeSlashIcon style={{ width: 15, height: 15 }} />}
          </button>
          <button onClick={onEdit}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-600)', padding: 5, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
            <PencilIcon style={{ width: 14, height: 14 }} />
          </button>
          <button onClick={onDelete}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 5, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
            <TrashIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────
const Leaderboard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [entries,      setEntries]      = useState<Entry[]>([]);
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
      const url = isAdmin ? '/leaderboard/all' : '/leaderboard';
      const res = await axios.get(url);
      setEntries(res.data.entries || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const fetchVendorOpts = async () => {
    try {
      const res = await axios.get('/leaderboard/vendors');
      setVendorOpts(res.data.vendors || []);
    } catch { /* ignore */ }
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

  const openAdd = () => { setEditEntry(null); setForm({ ...BLANK_FORM }); setShowModal(true); };
  const openEdit = (e: Entry) => {
    setEditEntry(e);
    setForm({
      vendorId:        e.vendor || '',
      vendorName:      e.vendorName,
      portal:          e.portal,
      carrier:         e.carrier,
      shippingService: e.shippingService,
      successRate:     String(e.successRate),
      totalLabels:     String(e.totalLabels),
      isVisible:       e.isVisible,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vendorName.trim() || !form.successRate) { notify('Vendor name and success rate are required', true); return; }
    const rate = parseFloat(form.successRate);
    if (isNaN(rate) || rate < 0 || rate > 100) { notify('Success rate must be 0–100', true); return; }
    setSaving(true);
    try {
      const payload = {
        vendorName:      form.vendorName.trim(),
        portal:          form.portal,
        carrier:         form.carrier || 'USPS',
        shippingService: form.shippingService,
        successRate:     rate,
        totalLabels:     parseInt(form.totalLabels) || 0,
        isVisible:       form.isVisible,
        vendorId:        form.vendorId || null,
      };
      if (editEntry) {
        await axios.put(`/leaderboard/${editEntry._id}`, payload);
        notify('Entry updated');
      } else {
        await axios.post('/leaderboard', payload);
        notify('Entry added');
      }
      setShowModal(false);
      fetchEntries();
    } catch (err: any) {
      notify(err.response?.data?.message || 'Save failed', true);
    } finally { setSaving(false); }
  };

  const handleDelete = async (e: Entry) => {
    if (!window.confirm(`Remove "${e.vendorName}" from the leaderboard?`)) return;
    try {
      await axios.delete(`/leaderboard/${e._id}`);
      notify('Entry removed');
      fetchEntries();
    } catch (err: any) { notify(err.response?.data?.message || 'Delete failed', true); }
  };

  const handleToggleVisibility = async (e: Entry) => {
    try {
      await axios.put(`/leaderboard/${e._id}`, { isVisible: !e.isVisible });
      fetchEntries();
    } catch { notify('Update failed', true); }
  };

  // Sorted + filtered
  const sorted = entries
    .filter(e => filterPortal === 'all' || e.portal === filterPortal)
    .sort((a, b) => b.successRate - a.successRate || b.totalLabels - a.totalLabels);

  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  // Counts per portal (visible entries only)
  const portalCounts = (['shippershub', 'labelcrow', 'shiplabel'] as const).reduce((acc, p) => {
    acc[p] = entries.filter(e => e.portal === p && e.isVisible).length;
    return acc;
  }, {} as Record<string, number>);
  const totalVisible = entries.filter(e => e.isVisible).length;

  return (
    <>
      {/* Leaderboard-specific layout tweaks */}
      <style>{`
        @media (min-width: 600px) { .lb-portal-badge { display: block !important; } }
        @keyframes lb-slide-up { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
        .lb-animate { animation: lb-slide-up 0.3s ease both; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} className="animate-fadeIn">

        {/* ── Hero header ──────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, var(--navy-900) 0%, var(--navy-800) 100%)',
          borderRadius: 'var(--radius-xl)',
          padding: '1.75rem 2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
          boxShadow: '0 8px 24px -4px rgba(15,23,42,0.35)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* decorative glow */}
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 180, height: 180,
            background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 'var(--radius-lg)',
              background: 'rgba(245,158,11,0.15)',
              border: '1.5px solid rgba(245,158,11,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TrophySolid style={{ width: 26, height: 26, color: '#F59E0B' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
                Vendor Leaderboard
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                Best-performing portals and vendors — curated by admin
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '1.25rem' }}>
              {[
                { label: 'Total Vendors', value: totalVisible },
                { label: 'Portals', value: 3 },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#F59E0B', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {isAdmin && (
              <button className="btn btn-primary" onClick={openAdd} style={{ flexShrink: 0 }}>
                <PlusIcon style={{ width: 15, height: 15 }} /> Add Entry
              </button>
            )}
          </div>
        </div>

        {/* ── Toast ─────────────────────────────────────────── */}
        {toast && (
          <div className={`alert ${toast.err ? 'alert-danger' : 'alert-success'}`}
            style={{ padding: '0.5rem 0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            {toast.err
              ? <ExclamationCircleIcon style={{ width: 15, height: 15 }} />
              : <CheckCircleIcon style={{ width: 15, height: 15 }} />}
            <span style={{ fontSize: '0.82rem' }}>{toast.msg}</span>
          </div>
        )}

        {/* ── Portal tabs ───────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 4, background: 'var(--bg-card)',
          padding: 4, borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.05)',
          overflowX: 'auto',
        }}>
          {([
            { key: 'all', label: 'All Portals', count: totalVisible, accent: 'var(--navy-700)', bg: 'var(--navy-900)' },
            { key: 'shippershub', label: PORTAL_CFG.shippershub.label, count: portalCounts.shippershub, accent: PORTAL_CFG.shippershub.accent, bg: PORTAL_CFG.shippershub.accent },
            { key: 'labelcrow',   label: PORTAL_CFG.labelcrow.label,   count: portalCounts.labelcrow,   accent: PORTAL_CFG.labelcrow.accent,   bg: PORTAL_CFG.labelcrow.accent },
            { key: 'shiplabel',   label: PORTAL_CFG.shiplabel.label,   count: portalCounts.shiplabel,   accent: PORTAL_CFG.shiplabel.accent,   bg: PORTAL_CFG.shiplabel.accent },
          ] as const).map(tab => {
            const active = filterPortal === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterPortal(tab.key as typeof filterPortal)}
                style={{
                  flex: '1 0 auto', padding: '0.5rem 0.875rem', borderRadius: 10,
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: active ? tab.bg : 'transparent',
                  color: active ? '#fff' : 'var(--navy-500)',
                  fontWeight: 700, fontSize: '0.8rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all 0.15s',
                  boxShadow: active ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: '0.65rem', fontWeight: 800, lineHeight: 1,
                  background: active ? 'rgba(255,255,255,0.2)' : 'var(--navy-100)',
                  color: active ? '#fff' : 'var(--navy-500)',
                  padding: '2px 6px', borderRadius: 99,
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Body ──────────────────────────────────────────── */}
        {loading ? (
          <div className="sh-card" style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
            <div className="spinner" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="sh-card">
            <div className="empty-state" style={{ padding: '4rem 1rem' }}>
              <TrophyIcon style={{ width: 44, height: 44, color: '#FCD34D' }} />
              <h3>No leaderboard entries yet</h3>
              {isAdmin
                ? <p>Click <strong>Add Entry</strong> to set up the first vendor ranking.</p>
                : <p>Check back soon — the admin is setting up vendor rankings.</p>}
            </div>
          </div>
        ) : (
          <>
            {/* ── Top 3 podium ──────────────────────────────── */}
            {top3.length > 0 && (
              <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'stretch' }}>
                {top3.map((e, i) => (
                  <div key={e._id} className="lb-animate" style={{ flex: 1, minWidth: 0, animationDelay: `${i * 60}ms` }}>
                    <PodiumCard entry={e} rank={i + 1} />
                    {isAdmin && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                        <button onClick={() => handleToggleVisibility(e)}
                          title={e.isVisible ? 'Visible' : 'Hidden'}
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(0,0,0,0.07)', cursor: 'pointer', padding: '3px 7px', borderRadius: 7, color: e.isVisible ? '#059669' : 'var(--navy-300)', display: 'flex', alignItems: 'center', boxShadow: 'var(--shadow-xs)' }}>
                          {e.isVisible ? <EyeIcon style={{ width: 13, height: 13 }} /> : <EyeSlashIcon style={{ width: 13, height: 13 }} />}
                        </button>
                        <button onClick={() => openEdit(e)}
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(0,0,0,0.07)', cursor: 'pointer', padding: '3px 7px', borderRadius: 7, color: 'var(--accent-600)', display: 'flex', alignItems: 'center', boxShadow: 'var(--shadow-xs)' }}>
                          <PencilIcon style={{ width: 13, height: 13 }} />
                        </button>
                        <button onClick={() => handleDelete(e)}
                          style={{ background: 'var(--bg-card)', border: '1px solid rgba(0,0,0,0.07)', cursor: 'pointer', padding: '3px 7px', borderRadius: 7, color: 'var(--danger-500)', display: 'flex', alignItems: 'center', boxShadow: 'var(--shadow-xs)' }}>
                          <TrashIcon style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Rank list (4+) ────────────────────────────── */}
            {rest.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* column headers */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '0 1.25rem', fontSize: '0.68rem', fontWeight: 700,
                  color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>
                  <div style={{ width: 36 }}>Rank</div>
                  <div style={{ width: 38 }} />
                  <div style={{ flex: 1 }}>Vendor</div>
                  <div style={{ width: 120 }}>Success Rate</div>
                  <div style={{ minWidth: 64, textAlign: 'right' }}>Labels</div>
                  {isAdmin && <div style={{ width: 88 }} />}
                </div>

                {rest.map((e, i) => (
                  <div key={e._id} className="lb-animate" style={{ animationDelay: `${(i + top3.length) * 40}ms` }}>
                    <RowCard
                      entry={e}
                      rank={i + 4}
                      isAdmin={isAdmin}
                      onEdit={() => openEdit(e)}
                      onDelete={() => handleDelete(e)}
                      onToggle={() => handleToggleVisibility(e)}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Footer note ───────────────────────────────────── */}
        {!isAdmin && entries.length > 0 && (
          <p style={{ fontSize: '0.72rem', color: 'var(--navy-400)', textAlign: 'center', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <StarIcon style={{ width: 12, height: 12 }} />
            Rankings are curated by the LabelFlow team based on real-world performance data.
          </p>
        )}
      </div>

      {/* ── Add / Edit modal ──────────────────────────────────── */}
      {showModal && (
        <Modal title={editEntry ? 'Edit Leaderboard Entry' : 'Add Leaderboard Entry'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

            {vendorOpts.length > 0 && (
              <div>
                <label className="form-label">
                  Pick from existing vendors
                  <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}> (optional — auto-fills below)</span>
                </label>
                <select className="form-input form-select" value={form.vendorId}
                  onChange={e => handleVendorPick(e.target.value)}>
                  <option value="">— select a vendor —</option>
                  {(['shippershub', 'labelcrow', 'shiplabel'] as const).map(p => {
                    const group = vendorOpts.filter(v =>
                      (v.source === 'shippershub' && p === 'shippershub') || v.source === p
                    );
                    if (!group.length) return null;
                    return (
                      <optgroup key={p} label={PORTAL_CFG[p].label}>
                        {group.map(v => (
                          <option key={v._id} value={v._id}>
                            {v.name}{v.shippingService ? ` · ${v.shippingService}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            )}

            <div style={{ borderTop: '1px dashed var(--navy-100)', paddingTop: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Display Name *</label>
                  <input className="form-input" value={form.vendorName}
                    onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))}
                    placeholder="e.g. USPS Ground Advantage (9201)" />
                </div>

                <div>
                  <label className="form-label">Portal *</label>
                  <select className="form-input form-select" value={form.portal}
                    onChange={e => setForm(f => ({ ...f, portal: e.target.value as Entry['portal'] }))}>
                    <option value="shippershub">ShippersHub</option>
                    <option value="labelcrow">Label Crow</option>
                    <option value="shiplabel">ShipLabel</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Carrier</label>
                  <input className="form-input" value={form.carrier}
                    onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))}
                    placeholder="USPS" />
                </div>

                <div>
                  <label className="form-label">Success Rate (%) *</label>
                  <input className="form-input" type="number" min="0" max="100" step="0.1"
                    value={form.successRate}
                    onChange={e => setForm(f => ({ ...f, successRate: e.target.value }))}
                    placeholder="e.g. 94.5" />
                </div>

                <div>
                  <label className="form-label">Total Labels</label>
                  <input className="form-input" type="number" min="0"
                    value={form.totalLabels}
                    onChange={e => setForm(f => ({ ...f, totalLabels: e.target.value }))}
                    placeholder="e.g. 12000" />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Shipping Service</label>
                  <input className="form-input" value={form.shippingService}
                    onChange={e => setForm(f => ({ ...f, shippingService: e.target.value }))}
                    placeholder="e.g. Ground Advantage" />
                </div>
              </div>

              {/* Live preview bar */}
              {form.successRate && !isNaN(parseFloat(form.successRate)) && (
                <div style={{
                  marginTop: '0.875rem', padding: '0.875rem 1rem',
                  background: 'var(--navy-50)', borderRadius: 10,
                  border: '1px solid var(--navy-100)',
                }}>
                  <div style={{ fontSize: '0.67rem', color: 'var(--navy-400)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Preview
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        width: `${Math.min(parseFloat(form.successRate), 100)}%`,
                        background: rateBarColor(parseFloat(form.successRate)),
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <span style={{
                      fontWeight: 900, fontSize: '1.1rem',
                      color: rateColor(parseFloat(form.successRate)),
                      minWidth: 48, textAlign: 'right',
                    }}>
                      {form.successRate}%
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.875rem' }}>
                <input type="checkbox" id="isVisible" checked={form.isVisible}
                  onChange={e => setForm(f => ({ ...f, isVisible: e.target.checked }))}
                  style={{ width: 15, height: 15, accentColor: 'var(--accent-600)' }} />
                <label htmlFor="isVisible" style={{ fontSize: '0.82rem', color: 'var(--navy-700)', cursor: 'pointer' }}>
                  Visible to users
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem' }}>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editEntry ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};

export default Leaderboard;
