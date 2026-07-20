import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  MagnifyingGlassIcon, CalendarDaysIcon, XMarkIcon,
  ChevronUpDownIcon, ChevronUpIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

interface UserRow {
  _id: string; firstName: string; lastName: string; email: string;
  isActive: boolean; phone?: string;
}

interface LabelStats {
  total: number; delivered: number; in_transit: number;
  exception_problem: number; not_scanned_yet: number; voided: number; spent: number;
}

const AVATAR_GRAD = 'linear-gradient(135deg,#64748b,#475569)';

const inp: React.CSSProperties = { height: 34, padding: '0 0.7rem', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.8rem', fontFamily: FONT, outline: 'none', boxSizing: 'border-box' };

type Period = 'all' | 'this_month' | 'last_month' | 'this_year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all',        label: 'All Time'   },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_year',  label: 'This Year'  },
];

function getPeriodRange(p: Period): { from?: string; to?: string } {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'all')        return {};
  if (p === 'this_month') return { from: fmt(new Date(y, m, 1)),     to: fmt(now) };
  if (p === 'last_month') return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
  if (p === 'this_year')  return { from: fmt(new Date(y, 0, 1)),     to: fmt(now) };
  return {};
}

type SortKey = 'name' | 'total' | 'deliveryRate' | 'scanRate' | 'errorRate' | 'voided' | 'spent';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronUpDownIcon style={{ width: 13, height: 13, color: 'var(--navy-300)', flexShrink: 0 }} />;
  return dir === 'desc'
    ? <ChevronDownIcon style={{ width: 13, height: 13, color: '#6366f1', flexShrink: 0 }} />
    : <ChevronUpIcon   style={{ width: 13, height: 13, color: '#6366f1', flexShrink: 0 }} />;
}

function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ padding: '0.7rem 0.9rem', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--navy-200)', minWidth: 90 }}>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
    </div>
  );
}

function UserDrawer({ user, stats, periodLabel, onClose, onPhoneSave }: {
  user: UserRow; stats: LabelStats | undefined; periodLabel: string;
  onClose: () => void; onPhoneSave: (userId: string, phone: string) => Promise<void>;
}) {
  const initials    = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const deliveryRate = stats && stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
  const activeTotal  = stats ? stats.total - stats.voided : 0;
  const scanRate     = activeTotal > 0 ? Math.round(((activeTotal - stats!.not_scanned_yet) / activeTotal) * 100) : 0;
  const errorRate    = stats && stats.total > 0 ? Math.round((stats.exception_problem / stats.total) * 100) : 0;

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneVal,     setPhoneVal]     = useState(user.phone || '');
  const [phoneSaving,  setPhoneSaving]  = useState(false);
  const [phoneErr,     setPhoneErr]     = useState('');

  const savePhone = async () => {
    const trimmed = phoneVal.trim();
    if (!trimmed) { setPhoneErr('Mobile number is required'); return; }
    setPhoneSaving(true); setPhoneErr('');
    try {
      await onPhoneSave(user._id, trimmed);
      setEditingPhone(false);
    } catch { setPhoneErr('Failed to save — try again'); }
    finally { setPhoneSaving(false); }
  };

  return ReactDOM.createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 340, background: 'var(--bg-card)', boxShadow: '-4px 0 32px rgba(15,23,42,0.18)', zIndex: 1001, display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
        {/* Header */}
        <div style={{ padding: '1.1rem 1.3rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: AVATAR_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>
            {initials || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.firstName} {user.lastName}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--navy-400)', display: 'flex', alignItems: 'center' }}>
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Status */}
        <div style={{ padding: '0.9rem 1.3rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: user.isActive ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: user.isActive ? '#22c55e' : '#94a3b8', display: 'inline-block' }} />
            {user.isActive ? 'Active' : 'Inactive'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--navy-400)', fontWeight: 500 }}>{periodLabel}</span>
        </div>

        {/* Contact */}
        <div style={{ padding: '0.85rem 1.3rem', borderBottom: '1px solid var(--navy-100)' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy-400)', marginBottom: '0.6rem' }}>Contact</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: '0.55rem', padding: '0.5rem 0.7rem', borderRadius: 8, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M2 5.5A2.5 2.5 0 014.5 3h11A2.5 2.5 0 0118 5.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 012 14.5v-9z" stroke="#6366f1" strokeWidth="1.5"/><path d="M2 6l8 5.5L18 6" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Email</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--navy-700)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            </div>
          </div>

          {/* WhatsApp */}
          <div style={{ padding: '0.5rem 0.7rem', borderRadius: 8, background: user.phone ? 'rgba(37,211,102,0.04)' : 'rgba(245,158,11,0.04)', border: `1px solid ${user.phone ? 'rgba(37,211,102,0.15)' : 'rgba(245,158,11,0.2)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: user.phone ? 'rgba(37,211,102,0.12)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill={user.phone ? '#25d366' : '#f59e0b'}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.099 1.523 5.82L0 24l6.344-1.501A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.969 0-3.806-.557-5.365-1.521l-.385-.229-3.989.944.96-3.904-.252-.397A9.964 9.964 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: user.phone ? '#25d366' : '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>WhatsApp</div>
                {!editingPhone && (
                  <div style={{ fontSize: '0.72rem', color: user.phone ? 'var(--navy-700)' : 'var(--navy-400)', fontWeight: user.phone ? 600 : 400, fontStyle: user.phone ? 'normal' : 'italic' }}>
                    {user.phone || 'No number added yet'}
                  </div>
                )}
              </div>
              {!editingPhone && (
                <button onClick={() => { setPhoneVal(user.phone || ''); setEditingPhone(true); setPhoneErr(''); }} style={{ fontSize: '0.62rem', fontWeight: 700, color: user.phone ? 'var(--navy-500)' : '#f59e0b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 5, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {user.phone ? 'Edit' : 'Add'}
                </button>
              )}
            </div>
            {editingPhone && (
              <div style={{ marginTop: '0.5rem' }}>
                <input autoFocus value={phoneVal} onChange={e => { setPhoneVal(e.target.value); setPhoneErr(''); }}
                  placeholder="+1 555 000 0000"
                  style={{ ...inp, width: '100%', fontSize: '0.78rem', height: 32 }}
                  onKeyDown={e => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setEditingPhone(false); }} />
                {phoneErr && <div style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: 3 }}>{phoneErr}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: '0.4rem' }}>
                  <button onClick={savePhone} disabled={phoneSaving} style={{ flex: 1, height: 28, borderRadius: 6, background: '#6366f1', color: '#fff', border: 'none', cursor: phoneSaving ? 'not-allowed' : 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: FONT, opacity: phoneSaving ? 0.7 : 1 }}>
                    {phoneSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingPhone(false)} style={{ height: 28, padding: '0 12px', borderRadius: 6, background: 'var(--navy-100)', color: 'var(--navy-600)', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, fontFamily: FONT }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: '1rem 1.3rem', flex: 1, overflowY: 'auto' }}>
          {!stats ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--navy-400)', paddingTop: '1rem' }}>No label data for this period.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              <StatChip label="Total Labels"  value={stats.total}                    color="#6366f1" />
              <StatChip label="Total Spent"   value={`$${stats.spent.toFixed(2)}`}  color="var(--navy-800)" />
              <StatChip label="Delivered"     value={stats.delivered}                color="#22c55e" />
              <StatChip label="Delivery Rate" value={`${deliveryRate}%`}             color={deliveryRate >= 80 ? '#22c55e' : '#f59e0b'} />
              <StatChip label="Scan Rate"     value={`${scanRate}%`}                 color={scanRate >= 80 ? '#22c55e' : scanRate >= 50 ? '#f59e0b' : '#ef4444'} />
              <StatChip label="Error Rate"    value={`${errorRate}%`}                color={errorRate === 0 ? '#94a3b8' : errorRate <= 5 ? '#f59e0b' : '#ef4444'} />
              <StatChip label="In Transit"    value={stats.in_transit}               color="#3b82f6" />
              <StatChip label="Exception"     value={stats.exception_problem}        color="#ef4444" />
              <StatChip label="Not Scanned"   value={stats.not_scanned_yet}          color="#94a3b8" />
              <StatChip label="Voided"        value={stats.voided}                   color="#94a3b8" />
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

export default function ResellerUserStats() {
  const { token } = useAuth();
  const [users,        setUsers]        = useState<UserRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [statsMap,     setStatsMap]     = useState<Record<string, LabelStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [search,       setSearch]       = useState('');
  const [period,       setPeriod]       = useState<Period>('this_month');
  const [showDrop,     setShowDrop]     = useState(false);
  const [sortKey,      setSortKey]      = useState<SortKey>('spent');
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('desc');
  const [drawerUser,   setDrawerUser]   = useState<UserRow | null>(null);

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_BASE}/users/reseller/clients`, { headers: authH() })
      .then(r => setUsers(r.data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authH]);

  useEffect(() => {
    setStatsLoading(true);
    const { from, to } = getPeriodRange(period);
    const params: Record<string, string> = {};
    if (from) params.dateFrom = from;
    if (to)   params.dateTo   = to;
    axios.get(`${API_BASE}/labels/user-stats-bulk-reseller`, { headers: authH(), params })
      .then(r => setStatsMap(r.data.statsMap || {}))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [period, authH]);

  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? 'This Month';

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    const sa = statsMap[a._id]; const sb = statsMap[b._id];
    let va = 0, vb = 0;
    if (sortKey === 'name') {
      const na = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nb = `${b.firstName} ${b.lastName}`.toLowerCase();
      return sortDir === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na);
    }
    if (sortKey === 'total')        { va = sa?.total || 0; vb = sb?.total || 0; }
    if (sortKey === 'deliveryRate') { va = sa?.total ? sa.delivered / sa.total : 0; vb = sb?.total ? sb.delivered / sb.total : 0; }
    if (sortKey === 'scanRate') {
      const ata = sa ? sa.total - sa.voided : 0; va = ata > 0 ? (ata - sa.not_scanned_yet) / ata : 0;
      const atb = sb ? sb.total - sb.voided : 0; vb = atb > 0 ? (atb - sb.not_scanned_yet) / atb : 0;
    }
    if (sortKey === 'errorRate') { va = sa?.total ? sa.exception_problem / sa.total : 0; vb = sb?.total ? sb.exception_problem / sb.total : 0; }
    if (sortKey === 'voided')    { va = sa?.voided || 0; vb = sb?.voided || 0; }
    if (sortKey === 'spent')     { va = sa?.spent || 0;  vb = sb?.spent || 0; }
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const totalLabels = Object.values(statsMap).reduce((s, v) => s + v.total, 0);
  const totalSpent  = Object.values(statsMap).reduce((s, v) => s + v.spent, 0);

  const thStyle = (key: SortKey): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: sortKey === key ? '#6366f1' : 'var(--navy-400)',
    userSelect: 'none', whiteSpace: 'nowrap',
  });

  const COL  = 'minmax(0,1fr)';
  const GRID = `36px ${COL} 44px 66px 74px 68px 66px 54px 80px`;

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>Client Stats</h1>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99 }}>
              {users.length} clients
            </span>
            {statsLoading && <span style={{ fontSize: '0.65rem', color: 'var(--navy-400)', fontWeight: 500 }}>Loading stats…</span>}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>
            {users.filter(u => u.isActive).length} active
          </div>
        </div>

        {/* Period picker */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowDrop(d => !d)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0.5rem 0.9rem', borderRadius: 8, cursor: 'pointer', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', color: 'var(--navy-700)', fontSize: '0.8rem', fontWeight: 600, fontFamily: FONT }}>
            <CalendarDaysIcon style={{ width: 14, height: 14 }} /> {periodLabel}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {showDrop && (
            <>
              <div onClick={() => setShowDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
              <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 10, minWidth: 140, overflow: 'hidden' }}>
                {PERIODS.map(p => (
                  <button key={p.key} onClick={() => { setPeriod(p.key); setShowDrop(false); setStatsMap({}); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 1rem', background: period === p.key ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: period === p.key ? 700 : 400, color: period === p.key ? '#6366f1' : 'var(--navy-700)', fontFamily: FONT }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
        {[
          { label: 'Total Clients', value: users.length,                          color: '#6366f1' },
          { label: 'Active',        value: users.filter(u => u.isActive).length,  color: '#22c55e' },
          { label: 'Total Labels',  value: totalLabels.toLocaleString(),           color: '#3b82f6' },
          { label: 'Total Spent',   value: `$${totalSpent.toFixed(2)}`,            color: 'var(--navy-800)' },
        ].map(c => (
          <div key={c.label} className="db-card" style={{ padding: '0.8rem 1rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.color, borderRadius: '16px 16px 0 0' }} />
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-400)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="db-card" style={{ padding: '0.8rem 1rem', marginBottom: '0.85rem' }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--navy-400)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" style={{ ...inp, paddingLeft: 30, width: '100%' }} />
        </div>
      </div>

      {/* Table */}
      <div className="db-card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 0.75rem', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1.5px solid var(--navy-100)', background: 'var(--navy-50)' }}>
          <div />
          <div onClick={() => handleSort('name')} style={thStyle('name')}>Client <SortIcon active={sortKey === 'name'} dir={sortDir} /></div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--navy-400)' }}>Status</div>
          <div onClick={() => handleSort('total')} style={{ ...thStyle('total'), justifyContent: 'flex-end' }}>Labels <SortIcon active={sortKey === 'total'} dir={sortDir} /></div>
          <div onClick={() => handleSort('deliveryRate')} style={{ ...thStyle('deliveryRate'), justifyContent: 'flex-end' }}>Delivery% <SortIcon active={sortKey === 'deliveryRate'} dir={sortDir} /></div>
          <div onClick={() => handleSort('scanRate')} style={{ ...thStyle('scanRate'), justifyContent: 'flex-end' }}>Scan% <SortIcon active={sortKey === 'scanRate'} dir={sortDir} /></div>
          <div onClick={() => handleSort('errorRate')} style={{ ...thStyle('errorRate'), justifyContent: 'flex-end' }}>Error% <SortIcon active={sortKey === 'errorRate'} dir={sortDir} /></div>
          <div onClick={() => handleSort('voided')} style={{ ...thStyle('voided'), justifyContent: 'flex-end' }}>Voided <SortIcon active={sortKey === 'voided'} dir={sortDir} /></div>
          <div onClick={() => handleSort('spent')} style={{ ...thStyle('spent'), justifyContent: 'flex-end' }}>Spent <SortIcon active={sortKey === 'spent'} dir={sortDir} /></div>
        </div>

        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 54, margin: '6px 12px', borderRadius: 8, background: 'linear-gradient(90deg,var(--navy-100) 25%,var(--navy-50) 50%,var(--navy-100) 75%)', backgroundSize: '200% 100%', animation: 'bl-shimmer 1.5s infinite', animationDelay: `${i * 80}ms` }} />
          ))
        ) : sorted.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem' }}>No clients found</div>
        ) : (
          sorted.map((u, idx) => {
            const stats        = statsMap[u._id];
            const initials     = `${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`.toUpperCase();
            const deliveryRate = stats && stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : null;
            const activeTotal  = stats ? stats.total - stats.voided : 0;
            const scanRate     = activeTotal > 0 ? Math.round(((activeTotal - stats!.not_scanned_yet) / activeTotal) * 100) : null;
            const errorRate    = stats && stats.total > 0 ? Math.round((stats.exception_problem / stats.total) * 100) : null;

            return (
              <div key={u._id} onClick={() => setDrawerUser(u)} style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 0.75rem', alignItems: 'center', padding: '0.65rem 1rem', cursor: 'pointer', borderTop: idx === 0 ? 'none' : '1px solid var(--navy-100)', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                <div style={{ width: 32, height: 32, borderRadius: '50%', background: AVATAR_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                  {initials || '?'}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.firstName} {u.lastName}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: u.isActive ? '#22c55e' : '#94a3b8', display: 'inline-block', flexShrink: 0 }} />
                </div>

                <div style={{ textAlign: 'right' }}>
                  {statsLoading && !stats ? (
                    <div style={{ width: 36, height: 10, borderRadius: 4, background: 'var(--navy-100)', marginLeft: 'auto' }} />
                  ) : (
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: stats?.total ? 'var(--navy-900)' : 'var(--navy-300)' }}>{stats?.total ?? '—'}</span>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  {statsLoading && !stats ? <div style={{ width: 36, height: 10, borderRadius: 4, background: 'var(--navy-100)', marginLeft: 'auto' }} />
                  : deliveryRate !== null ? <span style={{ fontSize: '0.85rem', fontWeight: 800, color: deliveryRate >= 80 ? '#22c55e' : deliveryRate >= 50 ? '#f59e0b' : '#ef4444' }}>{deliveryRate}%</span>
                  : <span style={{ fontSize: '0.85rem', color: 'var(--navy-300)' }}>—</span>}
                </div>

                <div style={{ textAlign: 'right' }}>
                  {statsLoading && !stats ? <div style={{ width: 36, height: 10, borderRadius: 4, background: 'var(--navy-100)', marginLeft: 'auto' }} />
                  : scanRate !== null ? <span style={{ fontSize: '0.85rem', fontWeight: 800, color: scanRate >= 80 ? '#22c55e' : scanRate >= 50 ? '#f59e0b' : '#ef4444' }}>{scanRate}%</span>
                  : <span style={{ fontSize: '0.85rem', color: 'var(--navy-300)' }}>—</span>}
                </div>

                <div style={{ textAlign: 'right' }}>
                  {statsLoading && !stats ? <div style={{ width: 32, height: 10, borderRadius: 4, background: 'var(--navy-100)', marginLeft: 'auto' }} />
                  : errorRate !== null ? <span style={{ fontSize: '0.85rem', fontWeight: 800, color: errorRate === 0 ? 'var(--navy-300)' : errorRate <= 5 ? '#f59e0b' : '#ef4444' }}>{errorRate}%</span>
                  : <span style={{ fontSize: '0.85rem', color: 'var(--navy-300)' }}>—</span>}
                </div>

                <div style={{ textAlign: 'right' }}>
                  {statsLoading && !stats ? <div style={{ width: 28, height: 10, borderRadius: 4, background: 'var(--navy-100)', marginLeft: 'auto' }} />
                  : <span style={{ fontSize: '0.85rem', fontWeight: 800, color: stats?.voided ? '#94a3b8' : 'var(--navy-300)' }}>{stats?.voided ?? '—'}</span>}
                </div>

                <div style={{ textAlign: 'right' }}>
                  {statsLoading && !stats ? <div style={{ width: 48, height: 10, borderRadius: 4, background: 'var(--navy-100)', marginLeft: 'auto' }} />
                  : <span style={{ fontSize: '0.85rem', fontWeight: 800, color: stats?.spent ? 'var(--navy-800)' : 'var(--navy-300)' }}>{stats ? `$${stats.spent.toFixed(2)}` : '—'}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {drawerUser && (
        <UserDrawer
          user={drawerUser}
          stats={statsMap[drawerUser._id]}
          periodLabel={periodLabel}
          onClose={() => setDrawerUser(null)}
          onPhoneSave={async (userId, phone) => {
            await axios.put(`${API_BASE}/users/${userId}`, { phone }, { headers: authH() });
            setUsers(prev => prev.map(u => u._id === userId ? { ...u, phone } : u));
            setDrawerUser(prev => prev && prev._id === userId ? { ...prev, phone } : prev);
          }}
        />
      )}
    </div>
  );
}
