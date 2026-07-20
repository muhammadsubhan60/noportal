import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  UserGroupIcon, TagIcon, ClipboardDocumentListIcon, CurrencyDollarIcon,
  BuildingStorefrontIcon, ExclamationTriangleIcon,
  ArrowPathIcon, TruckIcon, Squares2X2Icon,
  ArrowUpRightIcon, SparklesIcon, BellAlertIcon, XMarkIcon,
  BanknotesIcon, ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AdminStats {
  users: {
    total: number; admin: number; reseller: number; user: number;
    active: number; inactive: number; newThisMonth: number;
  };
  labels: {
    total: number; generated: number; failed: number; revenue: number;
    today: number; byCarrier: Record<string, number>;
  };
  labelsByPortal: Record<string, { count: number; revenue: number }>;
  trackingStatus: {
    not_scanned_yet: number; in_transit: number; out_for_delivery: number; delivered: number;
    exception_problem: number; returned_to_sender: number; pending_pickup: number; delayed: number;
    voided: number;
  };
  manifests: {
    total: number; active: number; underReview: number; completed: number;
    cancelled: number; revenue: number; byStatus: Record<string, number>;
  };
  vendors: { active: number; inactive: number; dueBalance: number; totalEarnings: number };
  totalBalanceHeld: number;
  totalRevenue: number;
  recentManifests: any[];
  recentUsers: any[];
  alerts: {
    lowBalance: { _id: string; firstName: string; lastName: string; email: string; balance: number }[];
    exceptions: { _id: string; firstName: string; lastName: string; email: string; count: number; lastAt: string }[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (v: number) => v.toLocaleString('en-US');

const MANIFEST_STATUS_COLOR: Record<string, string> = {
  open: '#6366f1', assigned: '#0ea5e9', accepted: '#0ea5e9',
  uploaded: '#f59e0b', under_review: '#ef4444',
  completed: '#22c55e', cancelled: '#94a3b8', rejected: '#f97316',
};
const MANIFEST_STATUS_LABEL: Record<string, string> = {
  open: 'Open', assigned: 'Assigned', accepted: 'Accepted',
  uploaded: 'Uploaded', under_review: 'Under Review',
  completed: 'Completed', cancelled: 'Cancelled', rejected: 'Rejected',
};
const CARRIER_COLORS: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#5B21B6', DHL: '#B45309',
};
const CARRIER_GRADIENT: Record<string, string> = {
  USPS: 'linear-gradient(90deg,#1D4ED8,#60A5FA)',
  UPS:  'linear-gradient(90deg,#92400E,#F59E0B)',
  FedEx:'linear-gradient(90deg,#5B21B6,#A78BFA)',
  DHL:  'linear-gradient(90deg,#B45309,#FCD34D)',
};

// ── Section label (accent bar + caps text) ────────────────────────────────────
const SLabel = ({ text, accent = 'var(--accent-500)' }: { text: string; accent?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <div style={{ width: 3, height: 13, borderRadius: 3, background: accent, flexShrink: 0 }} />
    <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>
      {text}
    </span>
  </div>
);

// ── KPI card (matches user dashboard style) ───────────────────────────────────
const KpiCard = ({ label, value, sub, color, Icon, onClick }: {
  label: string; value: string | number; sub?: string;
  color: string; Icon: React.ElementType; onClick?: () => void;
}) => {
  const [hov, setHov] = useState(false);
  return (
    <div
      className={`db-card${onClick ? ' db-card-hover' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ padding: '1rem 1.1rem', position: 'relative', overflow: 'hidden', fontFamily: FONT }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '16px 16px 0 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, border: `1px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon style={{ width: 16, height: 16, color }} />
        </div>
        {onClick && (
          <ArrowUpRightIcon style={{ width: 13, height: 13, color: hov ? color : 'var(--navy-300)', transition: 'color 0.15s', flexShrink: 0 }} />
        )}
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.035em', lineHeight: 1, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{label}</div>
      {sub && <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid var(--navy-100)', fontSize: '0.72rem', color: 'var(--navy-500)' }}>{sub}</div>}
    </div>
  );
};

// ── Bar row (carrier / user breakdown) ───────────────────────────────────────
const BarRow = ({ label, count, total, gradient, color }: {
  label: string; count: number; total: number; gradient?: string; color: string;
}) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>{label}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)', fontFamily: FONT }}>{fmtN(count)} · {pct}%</span>
      </div>
      <div style={{ height: 7, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: gradient || color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
};

// ── Status pill ───────────────────────────────────────────────────────────────
const StatusPill = ({ status }: { status: string }) => {
  const color = MANIFEST_STATUS_COLOR[status] || '#94a3b8';
  return (
    <span style={{
      fontSize: '0.67rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: `${color}18`, color, border: `1px solid ${color}28`,
      fontFamily: FONT,
    }}>
      {MANIFEST_STATUS_LABEL[status] || status}
    </span>
  );
};

// ── Quick Action button ────────────────────────────────────────────────────────
const QAction = ({ label, sub, Icon, color, onClick }: {
  label: string; sub: string; Icon: React.ElementType; color: string; onClick: () => void;
}) => {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 0.85rem',
        borderRadius: 10, width: '100%', textAlign: 'left',
        border: `1px solid ${hov ? color + '40' : 'var(--navy-200)'}`,
        background: hov ? `${color}08` : 'var(--bg-card)',
        cursor: 'pointer', transition: 'all 0.15s', fontFamily: FONT,
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `${color}15`, border: `1px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon style={{ width: 15, height: 15, color }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{sub}</div>
      </div>
      <ArrowUpRightIcon style={{ width: 13, height: 13, color: hov ? color : 'var(--navy-300)', transition: 'color 0.15s', flexShrink: 0 }} />
    </button>
  );
};

type PeriodPreset = 'all' | 'this_month' | 'last_month' | 'last_3m' | 'custom';

// ── Admin Dashboard ────────────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats,           setStats]           = useState<AdminStats | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [topVendors,      setTopVendors]      = useState<any[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const dismissAlert = (id: string) => setDismissedAlerts(prev => prev.includes(id) ? prev : [...prev, id]);

  // Period filter
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month');
  const [periodFrom,   setPeriodFrom]   = useState('');
  const [periodTo,     setPeriodTo]     = useState('');

  const getPeriodRange = useCallback((preset: PeriodPreset, pFrom = periodFrom, pTo = periodTo) => {
    const n = new Date();
    if (preset === 'this_month') {
      const f = new Date(n.getFullYear(), n.getMonth(), 1);
      const t = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59);
      return { from: toISO(f), to: toISO(t) };
    }
    if (preset === 'last_month') {
      const f = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      const t = new Date(n.getFullYear(), n.getMonth(), 0, 23, 59, 59);
      return { from: toISO(f), to: toISO(t) };
    }
    if (preset === 'last_3m') {
      const f = new Date(n.getFullYear(), n.getMonth() - 2, 1);
      return { from: toISO(f), to: toISO(n) };
    }
    if (preset === 'custom') return { from: pFrom, to: pTo };
    return { from: '', to: '' };
  }, [periodFrom, periodTo]);

  // Chart state
  // (toISO already defined above)
  const nowDate = new Date();
  const [chartFrom,     setChartFrom]     = useState(toISO(new Date(nowDate.getTime() - 29 * 86400000)));
  const [chartTo,       setChartTo]       = useState(toISO(nowDate));
  const [chartCarrier,  setChartCarrier]  = useState('all');
  const [chartData,     setChartData]     = useState<any[]>([]);
  const [chartKeys,     setChartKeys]     = useState<string[]>([]);
  const [vendorTotals,  setVendorTotals]  = useState<{ name: string; total: number }[]>([]);
  const [chartGrouping, setChartGrouping] = useState('day');
  const [chartLoading,  setChartLoading]  = useState(false);
  const [activePreset,  setActivePreset]  = useState('30D');
  const [dateError,     setDateError]     = useState('');

  const PRESETS = [
    { label: '7D',  days: 7   },
    { label: '30D', days: 30  },
    { label: '3M',  days: 90  },
    { label: '1Y',  days: 365 },
  ];

  const applyPreset = useCallback((days: number, label: string) => {
    const t = new Date(); t.setHours(23, 59, 59, 999);
    const f = new Date(t.getTime() - (days - 1) * 86400000); f.setHours(0, 0, 0, 0);
    setChartFrom(toISO(f)); setChartTo(toISO(t));
    setActivePreset(label); setDateError('');
  }, []);

  const handleFromChange = (val: string) => {
    setActivePreset('');
    if ((new Date(chartTo).getTime() - new Date(val).getTime()) / 86400000 > 31) { setDateError('Custom range cannot exceed 31 days'); return; }
    setDateError(''); setChartFrom(val);
  };
  const handleToChange = (val: string) => {
    setActivePreset('');
    if ((new Date(val).getTime() - new Date(chartFrom).getTime()) / 86400000 > 31) { setDateError('Custom range cannot exceed 31 days'); return; }
    setDateError(''); setChartTo(val);
  };

  const loadChart = useCallback(async (from: string, to: string, carrier: string) => {
    setChartLoading(true);
    try {
      const res = await axios.get('/stats/label-chart', { params: { from, to, carrier } });
      setChartData(res.data.data || []);
      setChartKeys(res.data.keys || []);
      setVendorTotals(res.data.vendorTotals || []);
      setChartGrouping(res.data.grouping || 'day');
    } catch {}
    finally { setChartLoading(false); }
  }, []);

  const load = useCallback(async (showRefresh = false, preset = periodPreset, pFrom = periodFrom, pTo = periodTo) => {
    if (showRefresh) setRefreshing(true);
    try {
      const { from, to } = getPeriodRange(preset, pFrom, pTo);
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to)   params.to   = to;
      const vParams: Record<string, string> = {};
      if (from) vParams.dateFrom = from;
      if (to)   vParams.dateTo   = to;

      const [statsRes, vendorRes] = await Promise.all([
        axios.get('/stats', { params }),
        axios.get('/labels/vendor-stats', { params: vParams }),
      ]);
      setStats(statsRes.data);

      // Compute composite scores and pick top 5
      const raw: any[] = vendorRes.data.vendors || [];
      const scored = raw.map(v => {
        const eff = v.total - (v.voided || 0);
        if (!eff) return { ...v, _score: 0, _del: 0, _scn: 0, _err: 0, _eff: 0 };
        const del = Math.round(v.delivered / eff * 100);
        const scn = Math.round((eff - (v.not_scanned_yet || 0)) / eff * 100);
        const err = Math.round((v.exception_problem || 0) / eff * 100);
        const rawScore = del * (scn + (100 - err)) / 200;
        const vol = eff / (eff + 100);
        return { ...v, _score: Math.round(rawScore * vol * 10) / 10, _del: del, _scn: scn, _err: err, _eff: eff };
      }).sort((a, b) => b._score - a._score).slice(0, 5);
      setTopVendors(scored);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [periodPreset, periodFrom, periodTo, getPeriodRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!dateError) loadChart(chartFrom, chartTo, chartCarrier); }, [chartFrom, chartTo, chartCarrier, loadChart, dateError]);

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>;
  if (!stats) return null;

  const { users, labels, manifests, vendors, labelsByPortal, trackingStatus, totalBalanceHeld, totalRevenue, recentManifests, recentUsers, alerts } = stats;
  const labelTotal = labels.total || 1;

  const now = new Date();
  const greeting  = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Chart colors
  const CHART_CARRIER_COLORS: Record<string, string> = { USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#7C3AED', DHL: '#B45309' };
  const VENDOR_PALETTE = ['#6366f1','#0ea5e9','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];
  const keyColors: Record<string, string> = {};
  chartKeys.forEach((k, i) => {
    keyColors[k] = chartCarrier === 'all' ? (CHART_CARRIER_COLORS[k] || VENDOR_PALETTE[i % VENDOR_PALETTE.length]) : VENDOR_PALETTE[i % VENDOR_PALETTE.length];
  });
  const isEmpty = chartKeys.length === 0 || chartData.every(d => chartKeys.every(k => !d[k]));
  const periodTotal = chartData.reduce((s, d) => s + (d.total || 0), 0);
  const groupLabel  = chartGrouping === 'day' ? 'Daily' : chartGrouping === 'week' ? 'Weekly' : 'Monthly';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: FONT }}>

      {/* ── Hero + Period filter ──────────────────────────────────────────────── */}
      {(() => {
        const PRESETS_PERIOD = [
          { key: 'all',        label: 'All Time'     },
          { key: 'this_month', label: 'This Month'   },
          { key: 'last_month', label: 'Last Month'   },
          { key: 'last_3m',    label: 'Last 3 Months'},
        ] as const;
        const applyPreset = (key: PeriodPreset) => { setPeriodPreset(key); load(false, key, periodFrom, periodTo); };
        const applyCustom = () => { if (!periodFrom || !periodTo) return; setPeriodPreset('custom'); load(false, 'custom', periodFrom, periodTo); };
        const { from: activeFrom, to: activeTo } = getPeriodRange(periodPreset);

        return (
          <div style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
            borderRadius: 18, overflow: 'hidden', position: 'relative',
          }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 90% at 8% 50%, rgba(59,130,246,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />

            {/* Greeting row + period filters */}
            <div style={{ padding: '1.4rem 2rem', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div>
                <p style={{ color: 'rgba(148,163,184,0.65)', fontSize: '0.7rem', fontWeight: 500, margin: '0 0 4px', letterSpacing: '0.03em' }}>{dateLabel}</p>
                <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 3px', lineHeight: 1.15 }}>
                  {greeting}, <span style={{ color: '#60A5FA' }}>{user?.firstName}</span>
                </h1>
                <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>Platform overview — admin control center</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.63rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0, fontFamily: FONT }}>Period</span>

                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: 2, gap: 1 }}>
                  {PRESETS_PERIOD.map(p => (
                    <button key={p.key} onClick={() => applyPreset(p.key as PeriodPreset)} style={{
                      padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontSize: '0.71rem', fontWeight: 700, fontFamily: FONT, transition: 'all 0.12s',
                      background: periodPreset === p.key ? 'rgba(255,255,255,0.14)' : 'transparent',
                      color:      periodPreset === p.key ? '#fff' : 'rgba(255,255,255,0.38)',
                      boxShadow:  periodPreset === p.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                    }}>{p.label}</button>
                  ))}
                </div>

                <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                    style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, padding: '3px 7px', fontSize: '0.73rem', color: '#e2e8f0', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', fontFamily: FONT, colorScheme: 'dark' }} />
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>to</span>
                  <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                    style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, padding: '3px 7px', fontSize: '0.73rem', color: '#e2e8f0', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', fontFamily: FONT, colorScheme: 'dark' }} />
                  <button onClick={applyCustom} disabled={!periodFrom || !periodTo} style={{ padding: '4px 12px', borderRadius: 7, border: 'none', background: (!periodFrom || !periodTo) ? 'rgba(255,255,255,0.06)' : 'rgba(99,102,241,0.75)', color: (!periodFrom || !periodTo) ? 'rgba(255,255,255,0.25)' : '#fff', fontSize: '0.71rem', fontWeight: 700, cursor: (!periodFrom || !periodTo) ? 'not-allowed' : 'pointer', fontFamily: FONT }}>
                    Apply
                  </button>
                </div>

                <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

                <button onClick={() => load(true)} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '0.45rem 0.85rem', fontSize: '0.75rem', fontWeight: 600, cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.7 : 1, fontFamily: FONT }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}>
                  <ArrowPathIcon style={{ width: 13, height: 13, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>

                {periodPreset !== 'all' && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 99, padding: '3px 10px', fontFamily: FONT, flexShrink: 0 }}>
                    {activeFrom} → {activeTo}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Alerts ───────────────────────────────────────────────────────────── */}
      {(() => {
        const visibleLow = (alerts?.lowBalance || []).filter(a => !dismissedAlerts.includes(`lb-${a._id}`));
        const visibleExc = (alerts?.exceptions || []).filter(a => !dismissedAlerts.includes(`ex-${a._id}`));
        const sectionHidden = dismissedAlerts.includes('__section__');
        if (sectionHidden || (!visibleLow.length && !visibleExc.length)) return null;

        const cardHeader = (accent: string, Icon: React.ElementType, title: string, sub: string, onViewAll: () => void) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.75rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accent}18`, border: `1px solid ${accent}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon style={{ width: 14, height: 14, color: accent }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>{title}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)', fontFamily: FONT, marginTop: 1 }}>{sub}</div>
            </div>
            <button
              onClick={onViewAll}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              View all
            </button>
          </div>
        );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Section header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 3, height: 13, borderRadius: 3, background: '#ef4444', flexShrink: 0 }} />
                <BellAlertIcon style={{ width: 13, height: 13, color: '#ef4444' }} />
                <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>
                  Alerts · {visibleLow.length + visibleExc.length}
                </span>
              </div>
              <button
                onClick={() => dismissAlert('__section__')}
                className="btn btn-ghost btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--navy-400)' }}
                title="Hide alerts until next refresh"
              >
                <XMarkIcon style={{ width: 13, height: 13 }} /> Hide
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: visibleLow.length && visibleExc.length ? '1fr 1fr' : '1fr', gap: '0.75rem' }}>

              {/* Low balance card */}
              {visibleLow.length > 0 && (
                <div className="db-card" style={{ overflow: 'hidden', padding: 0, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#f59e0b', borderRadius: '16px 16px 0 0' }} />
                  {cardHeader('#f59e0b', BanknotesIcon, 'Low Balance Users', `${visibleLow.length} user${visibleLow.length !== 1 ? 's' : ''} below $50`, () => navigate('/admin/users'))}
                  <div style={{ padding: '0.35rem 0.6rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {visibleLow.map(u => (
                      <div key={u._id}
                        onClick={() => navigate('/admin/users')}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.45rem', borderRadius: 8, cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.63rem', fontWeight: 800, color: '#fff', fontFamily: FONT }}>{u.firstName?.[0]}{u.lastName?.[0]}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.firstName} {u.lastName}</div>
                          <div style={{ fontSize: '0.64rem', color: 'var(--navy-400)', fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: u.balance <= 10 ? '#ef4444' : '#f59e0b', fontFamily: FONT, flexShrink: 0 }}>${u.balance.toFixed(2)}</span>
                        <button
                          onClick={e => { e.stopPropagation(); dismissAlert(`lb-${u._id}`); }}
                          style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-400)', flexShrink: 0, transition: 'all 0.12s' }}
                          onMouseEnter={e => Object.assign(e.currentTarget.style, { background: 'var(--navy-100)', color: 'var(--navy-700)' })}
                          onMouseLeave={e => Object.assign(e.currentTarget.style, { background: 'var(--navy-50)', color: 'var(--navy-400)' })}
                          title="Dismiss"
                        >
                          <XMarkIcon style={{ width: 10, height: 10 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exception users card */}
              {visibleExc.length > 0 && (
                <div className="db-card" style={{ overflow: 'hidden', padding: 0, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#ef4444', borderRadius: '16px 16px 0 0' }} />
                  {cardHeader('#ef4444', ExclamationCircleIcon, 'Exception / Problem', `${visibleExc.length} user${visibleExc.length !== 1 ? 's' : ''} with problem labels`, () => navigate('/command-center/labels'))}
                  <div style={{ padding: '0.35rem 0.6rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {visibleExc.map(ex => (
                      <div key={ex._id}
                        onClick={() => navigate('/command-center/labels')}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.45rem', borderRadius: 8, cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#ef4444,#dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.63rem', fontWeight: 800, color: '#fff', fontFamily: FONT }}>{ex.firstName?.[0]}{ex.lastName?.[0]}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.firstName} {ex.lastName}</div>
                          <div style={{ fontSize: '0.64rem', color: 'var(--navy-400)', fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.email}</div>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ef4444', background: 'var(--navy-50)', border: '1px solid var(--navy-200)', borderRadius: 6, padding: '2px 8px', fontFamily: FONT, flexShrink: 0 }}>
                          {ex.count} exception{ex.count !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); dismissAlert(`ex-${ex._id}`); }}
                          style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--navy-50)', border: '1px solid var(--navy-200)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-400)', flexShrink: 0, transition: 'all 0.12s' }}
                          onMouseEnter={e => Object.assign(e.currentTarget.style, { background: 'var(--navy-100)', color: 'var(--navy-700)' })}
                          onMouseLeave={e => Object.assign(e.currentTarget.style, { background: 'var(--navy-50)', color: 'var(--navy-400)' })}
                          title="Dismiss"
                        >
                          <XMarkIcon style={{ width: 10, height: 10 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── 6 KPI Cards ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
        <KpiCard label="Total Users"      value={fmtN(users.total)}           sub={`${users.newThisMonth} new this month`} color="#6366f1" Icon={UserGroupIcon}             onClick={() => navigate('/admin/users')} />
        <KpiCard label="Labels Generated" value={fmtN(labels.generated)}      sub={`${labels.today} today`}               color="#0ea5e9" Icon={TagIcon} />
        <KpiCard label="Active Manifests" value={fmtN(manifests.active)}      sub={`${manifests.underReview} need review`} color="#f59e0b" Icon={ClipboardDocumentListIcon} onClick={() => navigate('/admin/manifest')} />
        <KpiCard label="Pending Review"   value={fmtN(manifests.underReview)} sub="Jobs to approve"                       color="#ef4444" Icon={ExclamationTriangleIcon}    onClick={() => navigate('/admin/manifest')} />
        <KpiCard label="Platform Revenue" value={fmt$(totalRevenue)}           sub="Labels + manifests"                    color="#22c55e" Icon={CurrencyDollarIcon} />
        <KpiCard label="Balance Held"     value={fmt$(totalBalanceHeld)}       sub="Across all users"                     color="#8b5cf6" Icon={CurrencyDollarIcon} />
      </div>

      {/* ── 2-column main layout ─────────────────────────────────────────────── */}
      <div className="dashboard-layout">

        {/* ══ LEFT MAIN ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* User Breakdown */}
          <div className="db-card" style={{ padding: '1.1rem 1.3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
              <SLabel text="User Breakdown" accent="#6366F1" />
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', fontFamily: FONT }} onClick={() => navigate('/admin/users')}>Manage →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.9rem' }}>
              <BarRow label="Regular"  count={users.user}     total={users.total} color="#6366f1" gradient="linear-gradient(90deg,#6366f1,#A5B4FC)" />
              <BarRow label="Reseller" count={users.reseller} total={users.total} color="#0ea5e9" gradient="linear-gradient(90deg,#0ea5e9,#7DD3FC)" />
              <BarRow label="Admin"    count={users.admin}    total={users.total} color="#f59e0b" gradient="linear-gradient(90deg,#f59e0b,#FCD34D)" />
            </div>
            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--navy-100)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[
                { label: 'Active',    val: users.active,       color: '#22c55e' },
                { label: 'Inactive',  val: users.inactive,     color: '#94a3b8' },
                { label: 'New/month', val: users.newThisMonth, color: '#6366f1' },
                { label: 'Total',     val: users.total,        color: 'var(--navy-700)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: 'center', padding: '0.45rem', background: 'var(--navy-50)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color, letterSpacing: '-0.02em' }}>{fmtN(val)}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Labels by Carrier */}
          <div className="db-card" style={{ padding: '1.1rem 1.3rem' }}>
            <div style={{ marginBottom: '0.9rem' }}>
              <SLabel text="Labels by Carrier" accent="#1D4ED8" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.9rem' }}>
              {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => (
                <BarRow key={c} label={c} count={labels.byCarrier[c] || 0} total={labelTotal} color={CARRIER_COLORS[c]} gradient={CARRIER_GRADIENT[c]} />
              ))}
            </div>
            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--navy-100)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[
                { label: 'Total',     val: fmtN(labels.total),     color: 'var(--navy-700)' },
                { label: 'Generated', val: fmtN(labels.generated), color: '#22c55e' },
                { label: 'Failed',    val: fmtN(labels.failed),    color: '#ef4444' },
                { label: 'Revenue',   val: fmt$(labels.revenue),   color: '#6366f1' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: 'center', padding: '0.45rem', background: 'var(--navy-50)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color, letterSpacing: '-0.02em' }}>{val}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Labels by Portal */}
          <div className="db-card" style={{ padding: '1.1rem 1.3rem' }}>
            <div style={{ marginBottom: '0.9rem' }}>
              <SLabel text="Labels by Portal" accent="#059669" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
              {[
                { key: 'shippershub', label: 'ShippersHub', color: '#1D4ED8' },
                { key: 'labelcrow',   label: 'Label Crow',  color: '#7C3AED' },
                { key: 'shiplabel',   label: 'ShipLabel',   color: '#059669' },
              ].map(({ key, label, color }) => {
                const p = labelsByPortal?.[key] || { count: 0, revenue: 0 };
                const total = labels.generated || 1;
                const pct   = Math.round((p.count / total) * 100);
                return (
                  <div key={key} style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 12, padding: '0.9rem 1rem' }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: '1.55rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.04em', lineHeight: 1 }}>{fmtN(p.count)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 2, marginBottom: 8 }}>generated · {fmt$(p.revenue)}</div>
                    <div style={{ height: 5, background: `${color}20`, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.65rem', color, fontWeight: 700, marginTop: 4 }}>{pct}% of total</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Required — Manifest Jobs */}
          <div className="db-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.3rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <SLabel text="Action Required" accent="#ef4444" />
                {manifests.underReview > 0 && (
                  <span style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #FECACA', fontSize: '0.67rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>
                    {manifests.underReview} under review
                  </span>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', fontFamily: FONT }} onClick={() => navigate('/admin/manifest')}>View all →</button>
            </div>
            {recentManifests.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.8rem' }}>
                <SparklesIcon style={{ width: 28, height: 28, margin: '0 auto 8px', opacity: 0.3 }} />
                No pending manifest jobs.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="sh-table">
                  <thead>
                    <tr><th>User</th><th>Carrier</th><th>Labels</th><th>Amount</th><th>Vendor</th><th>Submitted</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {recentManifests.map((job: any) => (
                      <tr key={job._id} style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/manifest')}>
                        <td>
                          <div style={{ fontSize: '0.79rem', fontWeight: 600, color: 'var(--navy-800)' }}>{job.user?.firstName} {job.user?.lastName}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{job.user?.email}</div>
                        </td>
                        <td><span className={`carrier-badge ${job.carrier?.toLowerCase()}`}>{job.carrier}</span></td>
                        <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>{job.userBilling?.labelCount ?? '—'}</td>
                        <td style={{ fontWeight: 700, color: '#22c55e', fontSize: '0.8rem' }}>{fmt$(job.userBilling?.totalAmount || 0)}</td>
                        <td style={{ fontSize: '0.77rem', color: 'var(--navy-600)' }}>{job.assignedVendor?.name ?? '—'}</td>
                        <td style={{ fontSize: '0.77rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>{new Date(job.createdAt).toLocaleDateString()}</td>
                        <td><StatusPill status={job.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>{/* /left */}

        {/* ══ RIGHT SIDEBAR ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Vendor Health */}
          <div style={{
            background: 'linear-gradient(155deg, #0F172A 0%, #1E293B 55%, #14532d 100%)',
            borderRadius: 16, padding: '1.3rem 1.4rem',
            position: 'relative', overflow: 'hidden', color: '#fff', fontFamily: FONT,
          }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.05, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: '-40%', right: '-20%', width: 180, height: 180, background: 'radial-gradient(circle, rgba(34,197,94,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', position: 'relative' }}>
              <p style={{ fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.55, margin: 0 }}>Vendor Health</p>
              <button onClick={() => navigate('/admin/vendors')} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 7, padding: '3px 9px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                Manage →
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, position: 'relative' }}>
              {[
                { label: 'Active',   val: vendors.active,   color: '#34D399' },
                { label: 'Inactive', val: vendors.inactive, color: '#94a3b8' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.65rem 0.85rem' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color, letterSpacing: '-0.04em', lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: '0.63rem', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>{label} vendors</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
              {[
                { label: 'Payable to Vendors', val: fmt$(vendors.dueBalance),    color: '#FCA5A5' },
                { label: 'Vendor Earnings',    val: fmt$(vendors.totalEarnings), color: '#86EFAC' },
                { label: 'Balance Held (Users)',val: fmt$(totalBalanceHeld),      color: '#A5B4FC' },
              ].map(({ label, val, color }, i) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderTop: i === 0 ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: '0.72rem', opacity: 0.55 }}>{label}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Manifest Pipeline */}
          <div className="db-card" style={{ padding: '1.1rem 1.3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
              <SLabel text="Manifest Pipeline" accent="#f59e0b" />
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', fontFamily: FONT }} onClick={() => navigate('/admin/manifest')}>View all →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
              {['open','assigned','uploaded','under_review','completed','cancelled'].map(s => {
                const count = manifests.byStatus[s] || 0;
                const pct = manifests.total > 0 ? Math.round(count / manifests.total * 100) : 0;
                const color = MANIFEST_STATUS_COLOR[s];
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusPill status={s} />
                    <div style={{ flex: 1, height: 5, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-700)', width: 22, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ paddingTop: '0.65rem', borderTop: '1px solid var(--navy-100)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.73rem', color: 'var(--navy-500)' }}>Manifest Revenue</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#22c55e' }}>{fmt$(manifests.revenue)}</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="db-card" style={{ padding: '1.1rem 1.3rem' }}>
            <div style={{ marginBottom: '0.9rem' }}>
              <SLabel text="Quick Actions" accent="var(--accent-500)" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <QAction label="Manage Users"        sub="Add, edit, manage balances" Icon={UserGroupIcon}          color="#6366f1" onClick={() => navigate('/admin/users')} />
              <QAction label="Manifest Operations" sub="Review & approve jobs"      Icon={Squares2X2Icon}         color="#ef4444" onClick={() => navigate('/admin/manifest')} />
              <QAction label="Vendor Management"   sub="API & manifest vendors"     Icon={BuildingStorefrontIcon} color="#22c55e" onClick={() => navigate('/admin/vendors')} />
              <QAction label="Live Activity"        sub="Real-time platform feed"   Icon={TruckIcon}              color="#0ea5e9" onClick={() => navigate('/activity')} />
            </div>
          </div>

        </div>{/* /right sidebar */}
      </div>{/* /2-col */}

      {/* ── Label Tracking Status ───────────────────────────────────────────── */}
      {(() => {
        const ts = trackingStatus || {} as Record<string, number>;

        const journeyStages = [
          { key: 'not_scanned_yet',  label: 'Not Scanned',     color: '#64748B' },
          { key: 'in_transit',       label: 'In Transit',       color: '#0ea5e9' },
          { key: 'out_for_delivery', label: 'Out for Delivery', color: '#7C3AED' },
          { key: 'delivered',        label: 'Delivered',        color: '#15803D' },
        ] as const;

        const issueItems = [
          { key: 'exception_problem',  label: 'Exception', color: '#DC2626' },
          { key: 'returned_to_sender', label: 'Returned',  color: '#BE123C' },
          { key: 'delayed',            label: 'Delayed',   color: '#92400E' },
          { key: 'pending_pickup',     label: 'Pending',   color: '#C2410C' },
        ] as const;

        const tsDelivered  = ts.delivered ?? 0;
        const tsVoided     = ts.voided ?? 0;
        const tsTotal      = Object.values(ts).reduce((s, v) => s + v, 0);
        const tsActive     = tsTotal - tsVoided;
        const deliveryRate = tsActive > 0 ? Math.round((tsDelivered / tsActive) * 100) : 0;
        const tsIssueTotal = (ts.exception_problem ?? 0) + (ts.returned_to_sender ?? 0) + (ts.delayed ?? 0) + (ts.pending_pickup ?? 0);

        return (
          <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SLabel text="Label Tracking Status" accent="#0ea5e9" />
                <span style={{ fontSize: '0.67rem', color: 'var(--navy-400)', background: 'var(--navy-100)', padding: '2px 7px', borderRadius: 99, fontWeight: 600, fontFamily: FONT }}>
                  {fmtN(tsTotal)} labels
                </span>
              </div>
              {tsVoided > 0 && (
                <span style={{ fontSize: '0.65rem', color: 'var(--navy-400)', background: 'var(--navy-100)', border: '1px solid var(--navy-200)', padding: '2px 8px', borderRadius: 99, fontWeight: 600, fontFamily: FONT }}>
                  {fmtN(tsVoided)} voided
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Delivery rate headline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--navy-100)', flexWrap: 'wrap' }}>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#15803D', letterSpacing: '-0.045em', lineHeight: 1, fontFamily: FONT }}>
                    {deliveryRate}<span style={{ fontSize: '1.1rem' }}>%</span>
                  </div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: 2, fontFamily: FONT }}>Delivery Rate</div>
                </div>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ height: 8, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden', marginBottom: 5 }}>
                    <div style={{ width: `${deliveryRate}%`, height: '100%', background: 'linear-gradient(90deg,#22c55e,#16a34a)', borderRadius: 99, transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ fontSize: '0.63rem', color: 'var(--navy-400)', fontFamily: FONT }}>{fmtN(tsDelivered)} delivered</span>
                    <span style={{ fontSize: '0.63rem', color: 'var(--navy-400)', fontFamily: FONT }}>{fmtN(tsActive)} active labels</span>
                  </div>
                </div>
                {tsIssueTotal > 0 && (
                  <div style={{ flexShrink: 0, textAlign: 'center', padding: '6px 14px', background: '#DC262614', border: '1px solid #DC262640', borderRadius: 10 }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#DC2626', lineHeight: 1, fontFamily: FONT }}>{fmtN(tsIssueTotal)}</div>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2, fontFamily: FONT }}>Issues</div>
                  </div>
                )}
              </div>

              {/* Shipment journey pipeline */}
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8, fontFamily: FONT }}>Shipment Journey</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                  {journeyStages.map(({ key, label, color }) => {
                    const count = ts[key] ?? 0;
                    return (
                      <div key={key} style={{ padding: '0.7rem 0.8rem', background: count > 0 ? `${color}14` : 'var(--navy-50)', border: `1px solid ${count > 0 ? `${color}40` : 'var(--navy-100)'}`, borderRadius: 9 }}>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: count > 0 ? color : 'var(--navy-300)', letterSpacing: '-0.04em', lineHeight: 1, fontFamily: FONT }}>{fmtN(count)}</div>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: count > 0 ? color : 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4, fontFamily: FONT }}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Needs attention */}
              {tsIssueTotal > 0 && (
                <div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8, fontFamily: FONT }}>Needs Attention</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.5rem' }}>
                    {issueItems.map(({ key, label, color }) => {
                      const count = ts[key] ?? 0;
                      return (
                        <div key={key} style={{ padding: '0.55rem 0.7rem', background: count > 0 ? `${color}14` : 'var(--navy-50)', border: `1px solid ${count > 0 ? `${color}40` : 'var(--navy-100)'}`, borderRadius: 9, opacity: count > 0 ? 1 : 0.38 }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: count > 0 ? color : 'var(--navy-400)', letterSpacing: '-0.03em', lineHeight: 1, fontFamily: FONT }}>{fmtN(count)}</div>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: count > 0 ? color : 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3, fontFamily: FONT }}>{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* ── Label Generation Chart ──────────────────────────────────────────── */}
      <div className="db-card" style={{ padding: '1.2rem 1.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SLabel text="Label Generation" accent="#6366f1" />
            <span style={{ fontSize: '0.67rem', color: 'var(--navy-400)', background: 'var(--navy-100)', padding: '2px 7px', borderRadius: 99, fontWeight: 600, fontFamily: FONT }}>
              {groupLabel}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Preset buttons */}
            <div style={{ display: 'flex', background: 'var(--navy-100)', borderRadius: 8, padding: 2, gap: 1 }}>
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => applyPreset(p.days, p.label)} style={{
                  padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: '0.7rem', fontWeight: 700, fontFamily: FONT,
                  background: activePreset === p.label ? 'var(--bg-card)' : 'transparent',
                  color:      activePreset === p.label ? 'var(--navy-900)' : 'var(--navy-400)',
                  boxShadow:  activePreset === p.label ? '0 1px 4px rgba(0,0,0,0.09)' : 'none',
                  transition: 'all 0.12s',
                }}>{p.label}</button>
              ))}
            </div>

            <span style={{ width: 1, height: 18, background: 'var(--navy-200)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="date" value={chartFrom} max={chartTo} onChange={e => handleFromChange(e.target.value)}
                style={{ border: '1px solid var(--navy-200)', borderRadius: 7, padding: '3px 7px', fontSize: '0.74rem', color: 'var(--navy-800)', background: 'var(--bg-card)', cursor: 'pointer' }} />
              <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>to</span>
              <input type="date" value={chartTo} min={chartFrom} onChange={e => handleToChange(e.target.value)}
                style={{ border: '1px solid var(--navy-200)', borderRadius: 7, padding: '3px 7px', fontSize: '0.74rem', color: 'var(--navy-800)', background: 'var(--bg-card)', cursor: 'pointer' }} />
            </div>

            <span style={{ width: 1, height: 18, background: 'var(--navy-200)' }} />

            <select value={chartCarrier} onChange={e => setChartCarrier(e.target.value)}
              style={{ border: '1px solid var(--navy-200)', borderRadius: 7, padding: '4px 10px', fontSize: '0.76rem', fontWeight: 600, color: 'var(--navy-800)', background: 'var(--bg-card)', cursor: 'pointer', minWidth: 130, fontFamily: FONT }}>
              <option value="all">All Carriers</option>
              <option value="USPS">USPS — vendor view</option>
              <option value="UPS">UPS — vendor view</option>
              <option value="FedEx">FedEx — vendor view</option>
              <option value="DHL">DHL — vendor view</option>
            </select>
          </div>
        </div>

        {dateError && (
          <div style={{ fontSize: '0.73rem', color: '#ef4444', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}>
            <ExclamationTriangleIcon style={{ width: 13, height: 13 }} /> {dateError}
          </div>
        )}
        {chartCarrier !== 'all' && vendorTotals.length > 0 && (
          <div style={{ fontSize: '0.73rem', color: 'var(--navy-500)', marginBottom: '0.75rem', fontFamily: FONT }}>
            Showing <strong>{vendorTotals.length}</strong> vendor{vendorTotals.length !== 1 ? 's' : ''} for <strong>{chartCarrier}</strong>
            {' '}— top: <strong style={{ color: keyColors[chartKeys[0]] }}>{chartKeys[0]}</strong>
          </div>
        )}

        {chartLoading ? (
          <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : isEmpty ? (
          <div style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-300)', gap: 10 }}>
            <TagIcon style={{ width: 40, height: 40, opacity: 0.25 }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500, fontFamily: FONT }}>No labels generated in this period</span>
            <span style={{ fontSize: '0.73rem', color: 'var(--navy-300)', fontFamily: FONT }}>{chartFrom} → {chartTo}</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 6, right: 16, left: -20, bottom: 0 }}>
              <defs>
                {chartKeys.map(k => (
                  <linearGradient key={k} id={`grad-${k.replace(/\s+/g,'_')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={keyColors[k]} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={keyColors[k]} stopOpacity={0.01} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--navy-100)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--navy-400)', fontFamily: FONT }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--navy-400)', fontFamily: FONT }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid var(--navy-200)', boxShadow: '0 6px 20px rgba(0,0,0,0.1)', padding: '8px 12px', background: 'var(--bg-card)', fontFamily: FONT }} itemStyle={{ padding: '1px 0' }} labelStyle={{ fontWeight: 700, color: 'var(--navy-800)', marginBottom: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12, fontFamily: FONT }} formatter={(v) => <span style={{ color: 'var(--navy-600)', fontWeight: 600 }}>{v}</span>} />
              {chartKeys.map(k => (
                <Area key={k} type="monotone" dataKey={k} name={k} stroke={keyColors[k]} fill={`url(#grad-${k.replace(/\s+/g,'_')})`} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}

        {!isEmpty && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--navy-100)' }}>
            {chartKeys.map(k => {
              const total = chartData.reduce((s, d) => s + (d[k] || 0), 0);
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: keyColors[k], display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.73rem', color: 'var(--navy-500)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>{k}</span>
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT }}>{total.toLocaleString()}</span>
                </div>
              );
            })}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.73rem', color: 'var(--navy-400)', fontFamily: FONT }}>Period Total</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>{periodTotal.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Top Vendors ────────────────────────────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0.85rem 1.3rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SLabel text="Top Vendors" accent="#f59e0b" />
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', background: 'var(--navy-100)', padding: '2px 6px', borderRadius: 99 }}>by performance score</span>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', fontFamily: FONT }} onClick={() => navigate('/command-center/vendor-perf')}>Full leaderboard →</button>
        </div>
        {topVendors.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.8rem' }}>No vendor data for this period.</div>
        ) : (
          <div>
            {topVendors.map((v, i) => {
              const rank = i + 1;
              const rankBg = rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : 'var(--navy-200)';
              const rankFg = rank <= 3 ? '#fff' : 'var(--navy-500)';
              const PORTAL_META: Record<string, { name: string; color: string }> = {
                shippershub: { name: 'ShippersHub', color: '#6366f1' },
                labelcrow:   { name: 'LabelCrow',   color: '#0ea5e9' },
                shiplabel:   { name: 'ShipLabel',   color: '#10b981' },
                manual:      { name: 'Manual',      color: '#94a3b8' },
              };
              const portal = PORTAL_META[v.portal] || { name: v.portal || 'ShippersHub', color: '#6366f1' };
              const CARR_COLOR: Record<string, string> = { USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#5B21B6', DHL: '#B45309' };
              const cColor = CARR_COLOR[v.carrier] || '#64748b';
              const scoreColor = v._score >= 60 ? '#22c55e' : v._score >= 35 ? '#f59e0b' : '#ef4444';
              return (
                <div key={v._id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0.8rem 1.3rem', borderBottom: '1px solid var(--navy-50)', flexWrap: 'wrap' }}>
                  {/* Rank */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: rankBg, color: rankFg, fontSize: '0.65rem', fontWeight: 800 }}>{rank}</span>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: scoreColor, marginTop: 2 }}>{v._score} pts</span>
                  </div>
                  {/* Name + portal */}
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)', lineHeight: 1.2 }}>{v._id || '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: cColor, background: `${cColor}15`, border: `1px solid ${cColor}30`, padding: '1px 5px', borderRadius: 4 }}>{v.carrier || '—'}</span>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: portal.color }}>{portal.name}</span>
                    </div>
                  </div>
                  {/* Stats */}
                  <div style={{ display: 'flex', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Labels', value: v._eff.toLocaleString(),       color: 'var(--navy-700)' },
                      { label: 'DEL',    value: `${v._del}%`,                  color: v._del >= 80 ? '#22c55e' : v._del >= 65 ? '#f59e0b' : '#ef4444' },
                      { label: 'SCN',    value: `${v._scn}%`,                  color: v._scn >= 80 ? '#6366f1' : v._scn >= 60 ? '#f59e0b' : '#ef4444' },
                      { label: 'ERR',    value: `${v._err}%`,                  color: v._err === 0 ? '#22c55e' : v._err <= 5 ? '#f59e0b' : '#ef4444' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent Signups ─────────────────────────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0.85rem 1.3rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SLabel text="Recent Signups" accent="#6366F1" />
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', fontFamily: FONT }} onClick={() => navigate('/admin/users')}>All users →</button>
        </div>
        {recentUsers.length === 0 ? (
          <div className="empty-state"><UserGroupIcon style={{ width: 28, height: 28 }} /><p>No users yet.</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {recentUsers.map((u: any, i: number) => (
              <div key={u._id} style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '0.7rem 1.3rem',
                borderBottom: '1px solid var(--navy-50)',
                borderRight: '1px solid var(--navy-50)',
                transition: 'background 0.12s', cursor: 'pointer',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--navy-50)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                onClick={() => navigate('/admin/users')}
              >
                <div className="avatar avatar-sm avatar-indigo" style={{ fontSize: '0.62rem', flexShrink: 0 }}>
                  {u.firstName?.charAt(0)}{u.lastName?.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.firstName} {u.lastName}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                </div>
                <span style={{
                  fontSize: '0.63rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, textTransform: 'capitalize', flexShrink: 0,
                  background: u.role === 'admin' ? '#fef3c7' : u.role === 'reseller' ? '#ede9fe' : '#f0f9ff',
                  color:      u.role === 'admin' ? '#92400e' : u.role === 'reseller' ? '#5b21b6' : '#0369a1',
                }}>{u.role}</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: u.isActive ? '#22c55e' : '#ef4444' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', whiteSpace: 'nowrap', fontFamily: FONT }}>{new Date(u.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminDashboard;
