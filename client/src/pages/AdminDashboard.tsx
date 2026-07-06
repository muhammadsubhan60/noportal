import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  UserGroupIcon, TagIcon, ClipboardDocumentListIcon, CurrencyDollarIcon,
  BuildingStorefrontIcon, ExclamationTriangleIcon,
  ArrowPathIcon, UserPlusIcon, TruckIcon, Squares2X2Icon,
} from '@heroicons/react/24/outline';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

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
  manifests: {
    total: number; active: number; underReview: number; completed: number;
    cancelled: number; revenue: number;
    byStatus: Record<string, number>;
  };
  vendors: { active: number; inactive: number; dueBalance: number; totalEarnings: number };
  totalBalanceHeld: number;
  totalRevenue: number;
  recentManifests: any[];
  recentUsers: any[];
  trackingStatus: Record<string, number>;
  trackingStatusTotal: number;
  rates: { deliveryRate: number; scanningRate: number; unpaidPostageRate: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$  = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN  = (v: number) => v.toLocaleString('en-US');

const MANIFEST_STATUS_COLOR: Record<string, string> = {
  open:         '#6366f1',
  assigned:     '#0ea5e9',
  accepted:     '#0ea5e9',
  uploaded:     '#f59e0b',
  under_review: '#ef4444',
  completed:    '#22c55e',
  cancelled:    '#94a3b8',
  rejected:     '#f97316',
};

const MANIFEST_STATUS_LABEL: Record<string, string> = {
  open: 'Open', assigned: 'Assigned', accepted: 'Accepted',
  uploaded: 'Uploaded', under_review: 'Under Review',
  completed: 'Completed', cancelled: 'Cancelled', rejected: 'Rejected',
};

const CARRIER_COLORS: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#5B21B6', DHL: '#B45309',
};

// ── Tracking status config (mirrors LabelHistory.tsx) ──────────────────────────
const TS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  not_scanned_yet:    { label: 'Not Scanned Yet',    bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  in_transit:         { label: 'In Transit',          bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  out_for_delivery:   { label: 'Out for Delivery',    bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  delivered:          { label: 'Delivered',           bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  exception_problem:  { label: 'Exception / Problem', bg: '#FFF5F5', color: '#DC2626', border: '#FECACA' },
  returned_to_sender: { label: 'Returned to Sender',  bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
  pending_pickup:     { label: 'Pending Pickup',      bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  delayed:            { label: 'Delayed',             bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
};
const TS_OPTIONS = Object.keys(TS_CONFIG);

// ── MetricCard ─────────────────────────────────────────────────────────────────
const MetricCard = ({
  label, value, sub, color, Icon, onClick,
}: {
  label: string; value: string | number; sub?: string;
  color: string; Icon: React.ElementType; onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    style={{
      background: '#fff',
      border: '1.5px solid var(--navy-150, #e8edf5)',
      borderRadius: 14,
      padding: '1.2rem 1.4rem',
      display: 'flex', flexDirection: 'column', gap: 6,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow 0.15s, transform 0.15s',
      position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.09)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
  >
    <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: color, borderRadius: '14px 0 0 14px' }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon style={{ width: 16, height: 16, color }} />
      </div>
    </div>
    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>{sub}</div>}
  </div>
);

// ── BarRow ─────────────────────────────────────────────────────────────────────
const BarRow = ({ label, count, total, color }: { label: string; count: number; total: number; color: string }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 70, fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy-600)', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 7, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ width: 36, fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-700)', textAlign: 'right' }}>{fmtN(count)}</div>
    </div>
  );
};

// ── StatusPill ──────────────────────────────────────────────────────────────────
const StatusPill = ({ status }: { status: string }) => (
  <span style={{
    display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700,
    background: `${MANIFEST_STATUS_COLOR[status] || '#94a3b8'}18`,
    color: MANIFEST_STATUS_COLOR[status] || '#64748b',
  }}>
    {MANIFEST_STATUS_LABEL[status] || status}
  </span>
);

// ── Admin Dashboard ────────────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats]           = useState<AdminStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Chart state ────────────────────────────────────────────────────────────
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const nowDate = new Date();
  const [chartFrom,    setChartFrom]    = useState(toISO(new Date(nowDate.getTime() - 29 * 86400000)));
  const [chartTo,      setChartTo]      = useState(toISO(nowDate));
  const [chartCarrier, setChartCarrier] = useState('all');
  const [chartData,    setChartData]    = useState<any[]>([]);
  const [chartKeys,    setChartKeys]    = useState<string[]>([]);
  const [vendorTotals, setVendorTotals] = useState<{ name: string; total: number }[]>([]);
  const [chartGrouping, setChartGrouping] = useState('day');
  const [chartLoading, setChartLoading] = useState(false);
  const [activePreset, setActivePreset] = useState('30D');
  const [dateError,    setDateError]    = useState('');

  const PRESETS = [
    { label: '7D',  days: 7   },
    { label: '30D', days: 30  },
    { label: '3M',  days: 90  },
    { label: '1Y',  days: 365 },
  ];

  const applyPreset = useCallback((days: number, label: string) => {
    const t = new Date(); t.setHours(23,59,59,999);
    const f = new Date(t.getTime() - (days - 1) * 86400000); f.setHours(0,0,0,0);
    setChartFrom(toISO(f));
    setChartTo(toISO(t));
    setActivePreset(label);
    setDateError('');
  }, []);

  const handleFromChange = (val: string) => {
    setActivePreset('');
    const diff = (new Date(chartTo).getTime() - new Date(val).getTime()) / 86400000;
    if (diff > 31) { setDateError('Custom range cannot exceed 31 days'); return; }
    setDateError('');
    setChartFrom(val);
  };

  const handleToChange = (val: string) => {
    setActivePreset('');
    const diff = (new Date(val).getTime() - new Date(chartFrom).getTime()) / 86400000;
    if (diff > 31) { setDateError('Custom range cannot exceed 31 days'); return; }
    setDateError('');
    setChartTo(val);
  };

  const loadChart = useCallback(async (from: string, to: string, carrier: string) => {
    setChartLoading(true);
    try {
      const res = await axios.get('/stats/label-chart', { params: { from, to, carrier } });
      setChartData(res.data.data     || []);
      setChartKeys(res.data.keys     || []);
      setVendorTotals(res.data.vendorTotals || []);
      setChartGrouping(res.data.grouping || 'day');
    } catch (err) {
      console.error('Chart error:', err);
    } finally {
      setChartLoading(false);
    }
  }, []);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await axios.get('/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Admin stats error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!dateError) loadChart(chartFrom, chartTo, chartCarrier); }, [chartFrom, chartTo, chartCarrier, loadChart, dateError]);

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div className="spinner" />
    </div>
  );

  if (!stats) return null;

  const { users, labels, manifests, vendors, totalBalanceHeld, totalRevenue, recentManifests, recentUsers, trackingStatus, trackingStatusTotal, rates } = stats;
  const labelTotal = labels.total || 1; // avoid div/0
  const carrierKeys = ['USPS', 'UPS', 'FedEx', 'DHL'];

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">{greeting}, {user?.firstName}.</h1>
          <p className="page-subtitle">
            Platform overview · {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          className="btn btn-ghost btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          disabled={refreshing}
        >
          <ArrowPathIcon style={{ width: 14, height: 14, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Row 1 — 6 KPI cards ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '0.875rem' }}>
        <MetricCard label="Total Users"      value={fmtN(users.total)}          sub={`${users.newThisMonth} new this month`}  color="#6366f1" Icon={UserGroupIcon}             onClick={() => navigate('/admin/users')} />
        <MetricCard label="Labels Generated" value={fmtN(labels.generated)}     sub={`${labels.today} today`}                 color="#0ea5e9" Icon={TagIcon} />
        <MetricCard label="Active Manifests" value={fmtN(manifests.active)}     sub={`${manifests.underReview} need review`}  color="#f59e0b" Icon={ClipboardDocumentListIcon}   onClick={() => navigate('/admin/manifest')} />
        <MetricCard label="Pending Review"   value={fmtN(manifests.underReview)} sub="Manifest jobs to approve"               color="#ef4444" Icon={ExclamationTriangleIcon}      onClick={() => navigate('/admin/manifest')} />
        <MetricCard label="Platform Revenue" value={fmt$(totalRevenue)}          sub="Labels + manifests"                      color="#22c55e" Icon={CurrencyDollarIcon} />
        <MetricCard label="Balance Held"     value={fmt$(totalBalanceHeld)}      sub="Across all users"                        color="#8b5cf6" Icon={CurrencyDollarIcon} />
      </div>

      {/* ── Row 2 — Users + Manifest pipeline ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* User Breakdown */}
        <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>User Breakdown</h3>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/admin/users')}>
              Manage →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <BarRow label="Regular"  count={users.user}     total={users.total} color="#6366f1" />
            <BarRow label="Reseller" count={users.reseller} total={users.total} color="#0ea5e9" />
            <BarRow label="Admin"    count={users.admin}    total={users.total} color="#f59e0b" />
          </div>
          <div style={{ marginTop: '1.1rem', paddingTop: '1rem', borderTop: '1px solid var(--navy-100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Active',     val: users.active,   color: '#22c55e' },
              { label: 'Inactive',   val: users.inactive, color: '#94a3b8' },
              { label: 'New/month',  val: users.newThisMonth, color: '#6366f1' },
              { label: 'Total',      val: users.total,    color: 'var(--navy-700)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>{label}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{fmtN(val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Manifest Pipeline */}
        <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Manifest Pipeline</h3>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/admin/manifest')}>
              View all →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {['open','assigned','uploaded','under_review','completed','cancelled'].map(s => {
              const count = manifests.byStatus[s] || 0;
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <StatusPill status={s} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 80, height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${manifests.total > 0 ? Math.round(count / manifests.total * 100) : 0}%`, height: '100%', background: MANIFEST_STATUS_COLOR[s], borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)', width: 24, textAlign: 'right' }}>{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '1.1rem', paddingTop: '1rem', borderTop: '1px solid var(--navy-100)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>Manifest Revenue</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#22c55e' }}>{fmt$(manifests.revenue)}</span>
          </div>
        </div>
      </div>

      {/* ── Row 3 — Label Activity + Vendor Health ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Labels by Carrier */}
        <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '1rem' }}>Labels by Carrier</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {carrierKeys.map(c => (
              <BarRow key={c} label={c} count={labels.byCarrier[c] || 0} total={labelTotal} color={CARRIER_COLORS[c] || '#64748b'} />
            ))}
          </div>
          <div style={{ marginTop: '1.1rem', paddingTop: '1rem', borderTop: '1px solid var(--navy-100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Total Labels', val: fmtN(labels.total),     color: 'var(--navy-700)' },
              { label: 'Generated',    val: fmtN(labels.generated), color: '#22c55e' },
              { label: 'Failed',       val: fmtN(labels.failed),    color: '#ef4444' },
              { label: 'Revenue',      val: fmt$(labels.revenue),   color: '#6366f1' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>{label}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Vendor Health */}
        <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Vendor Health</h3>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/admin/vendors')}>
              Manage →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Vendor counts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Active Vendors',   val: vendors.active,   color: '#22c55e', bg: '#f0fdf4' },
                { label: 'Inactive Vendors', val: vendors.inactive, color: '#94a3b8', bg: '#f8fafc' },
              ].map(({ label, val, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{val}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--navy-500)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {/* Financial rows */}
            {[
              { label: 'Total Payable to Vendors', val: fmt$(vendors.dueBalance),    color: '#ef4444' },
              { label: 'Total Vendor Earnings',    val: fmt$(vendors.totalEarnings), color: '#22c55e' },
              { label: 'Total Balance Held (Users)',val: fmt$(totalBalanceHeld),      color: '#6366f1' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderTop: '1px solid var(--navy-100)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--navy-500)' }}>{label}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3.5 — Delivery & Tracking Health ────────────────────────────── */}
      <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Delivery & Tracking Health</h3>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/history')}>
            View labels →
          </button>
        </div>

        {/* Rate cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Delivery Rate',       value: rates.deliveryRate,      color: '#22c55e', sub: `${fmtN(trackingStatus.delivered)} of ${fmtN(trackingStatusTotal)} generated labels delivered` },
            { label: 'Scanning Rate',       value: rates.scanningRate,      color: '#0ea5e9', sub: `${fmtN(trackingStatusTotal - trackingStatus.not_scanned_yet)} of ${fmtN(trackingStatusTotal)} labels have a scan on file` },
            { label: 'Unpaid Postage Rate', value: rates.unpaidPostageRate, color: '#ef4444', sub: `${fmtN(trackingStatus.exception_problem)} labels flagged Exception / Problem` },
          ].map(({ label, value, color, sub }) => (
            <div key={label} style={{ background: `${color}0a`, border: `1.5px solid ${color}30`, borderRadius: 12, padding: '0.95rem 1.1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value.toFixed(1)}%</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 6 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Status breakdown pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TS_OPTIONS.map(k => {
            const cfg = TS_CONFIG[k];
            const count = trackingStatus[k] ?? 0;
            return (
              <div key={k} style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 20,
                border: `1.5px solid ${cfg.border}`, background: cfg.bg, color: cfg.color,
                fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                {cfg.label}
                <span style={{ background: 'rgba(15,23,42,0.06)', borderRadius: 10, padding: '1px 7px', fontSize: '0.68rem' }}>{fmtN(count)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Label Generation Chart ──────────────────────────────────────────── */}
      {(() => {
        // Color palettes
        const CARRIER_COLORS: Record<string, string> = {
          USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#7C3AED', DHL: '#B45309',
        };
        const VENDOR_PALETTE = [
          '#6366f1','#0ea5e9','#22c55e','#f59e0b','#ef4444',
          '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
          '#06b6d4','#a855f7','#10b981','#f43f5e','#64748b',
        ];

        const keyColors: Record<string, string> = {};
        chartKeys.forEach((k, i) => {
          keyColors[k] = chartCarrier === 'all'
            ? (CARRIER_COLORS[k] || VENDOR_PALETTE[i % VENDOR_PALETTE.length])
            : VENDOR_PALETTE[i % VENDOR_PALETTE.length];
        });

        const isEmpty = chartKeys.length === 0 || chartData.every(d => chartKeys.every(k => !d[k]));
        const periodTotal = chartData.reduce((s, d) => s + (d.total || 0), 0);
        const groupLabel = chartGrouping === 'day' ? 'Daily' : chartGrouping === 'week' ? 'Weekly' : 'Monthly';

        return (
          <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>

            {/* ── Top row: title + controls ─────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1.1rem' }}>

              {/* Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TagIcon style={{ width: 16, height: 16, color: '#6366f1' }} />
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Label Generation</h3>
                <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', background: 'var(--navy-100)', padding: '2px 7px', borderRadius: 99, fontWeight: 600 }}>
                  {groupLabel}
                </span>
              </div>

              {/* Controls row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

                {/* Preset buttons */}
                <div style={{ display: 'flex', background: 'var(--navy-100)', borderRadius: 8, padding: 2, gap: 1 }}>
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p.days, p.label)}
                      style={{
                        padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontSize: '0.72rem', fontWeight: 700,
                        background: activePreset === p.label ? '#fff' : 'transparent',
                        color:      activePreset === p.label ? 'var(--navy-900)' : 'var(--navy-400)',
                        boxShadow:  activePreset === p.label ? '0 1px 4px rgba(0,0,0,0.09)' : 'none',
                        transition: 'all 0.12s',
                      }}
                    >{p.label}</button>
                  ))}
                </div>

                {/* Divider */}
                <span style={{ width: 1, height: 20, background: 'var(--navy-200)' }} />

                {/* Date range pickers */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input
                    type="date" value={chartFrom} max={chartTo}
                    onChange={e => handleFromChange(e.target.value)}
                    style={{ border: '1.5px solid var(--navy-200)', borderRadius: 7, padding: '3px 8px', fontSize: '0.75rem', color: 'var(--navy-800)', background: '#fff', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>to</span>
                  <input
                    type="date" value={chartTo} min={chartFrom}
                    onChange={e => handleToChange(e.target.value)}
                    style={{ border: '1.5px solid var(--navy-200)', borderRadius: 7, padding: '3px 8px', fontSize: '0.75rem', color: 'var(--navy-800)', background: '#fff', cursor: 'pointer' }}
                  />
                </div>

                {/* Divider */}
                <span style={{ width: 1, height: 20, background: 'var(--navy-200)' }} />

                {/* Carrier dropdown */}
                <select
                  value={chartCarrier}
                  onChange={e => setChartCarrier(e.target.value)}
                  style={{
                    border: '1.5px solid var(--navy-200)', borderRadius: 7, padding: '4px 10px',
                    fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-800)',
                    background: '#fff', cursor: 'pointer', minWidth: 130,
                  }}
                >
                  <option value="all">All Carriers</option>
                  <option value="USPS">USPS — vendor view</option>
                  <option value="UPS">UPS — vendor view</option>
                  <option value="FedEx">FedEx — vendor view</option>
                  <option value="DHL">DHL — vendor view</option>
                </select>
              </div>
            </div>

            {/* Date error */}
            {dateError && (
              <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                <ExclamationTriangleIcon style={{ width: 13, height: 13 }} />
                {dateError}
              </div>
            )}

            {/* Vendor mode subtitle */}
            {chartCarrier !== 'all' && vendorTotals.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginBottom: '0.75rem' }}>
                Showing <strong>{vendorTotals.length}</strong> vendor{vendorTotals.length !== 1 ? 's' : ''} for <strong>{chartCarrier}</strong>
                {' '}— top: <strong style={{ color: keyColors[chartKeys[0]] }}>{chartKeys[0]}</strong>
              </div>
            )}

            {/* Chart area */}
            {chartLoading ? (
              <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner" />
              </div>
            ) : isEmpty ? (
              <div style={{ height: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-300)', gap: 10 }}>
                <TagIcon style={{ width: 44, height: 44, opacity: 0.25 }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>No labels generated in this period</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--navy-300)' }}>{chartFrom} → {chartTo}</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData} margin={{ top: 6, right: 16, left: -20, bottom: 0 }}>
                  <defs>
                    {chartKeys.map(k => (
                      <linearGradient key={k} id={`grad-${k.replace(/\s+/g,'_')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={keyColors[k]} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={keyColors[k]} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false} axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false} axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 6px 20px rgba(0,0,0,0.1)', padding: '8px 12px' }}
                    itemStyle={{ padding: '1px 0' }}
                    labelStyle={{ fontWeight: 700, color: 'var(--navy-800)', marginBottom: 4 }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 14 }}
                    formatter={(value) => <span style={{ color: 'var(--navy-600)', fontWeight: 600 }}>{value}</span>}
                  />
                  {chartKeys.map(k => (
                    <Area
                      key={k}
                      type="monotone"
                      dataKey={k}
                      name={k}
                      stroke={keyColors[k]}
                      fill={`url(#grad-${k.replace(/\s+/g,'_')})`}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}

            {/* Summary footer */}
            {!isEmpty && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--navy-100)' }}>
                {chartKeys.map(k => {
                  const total = chartData.reduce((s, d) => s + (d[k] || 0), 0);
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: keyColors[k], display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)' }}>{total.toLocaleString()}</span>
                    </div>
                  );
                })}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--navy-400)' }}>Period Total</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)' }}>{periodTotal.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Row 4 — Action Required (manifest jobs) ─────────────────────────── */}
      {recentManifests.length > 0 && (
        <div className="sh-card">
          <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ExclamationTriangleIcon style={{ width: 16, height: 16, color: '#ef4444' }} />
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Action Required — Manifest Jobs</h3>
              {manifests.underReview > 0 && (
                <span style={{ background: '#fef2f2', color: '#ef4444', fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>
                  {manifests.underReview} under review
                </span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/admin/manifest')}>
              View all →
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Carrier</th>
                  <th>Labels</th>
                  <th>Amount</th>
                  <th>Vendor</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentManifests.map((job: any) => (
                  <tr key={job._id} style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/manifest')}>
                    <td>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)' }}>
                        {job.user?.firstName} {job.user?.lastName}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{job.user?.email}</div>
                    </td>
                    <td><span className={`carrier-badge ${job.carrier?.toLowerCase()}`}>{job.carrier}</span></td>
                    <td style={{ fontWeight: 600 }}>{job.userBilling?.labelCount ?? '—'}</td>
                    <td style={{ fontWeight: 700, color: '#22c55e' }}>{fmt$(job.userBilling?.totalAmount || 0)}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--navy-600)' }}>{job.assignedVendor?.name ?? '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td><StatusPill status={job.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Row 5 — Quick Actions + Recent Signups ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' }}>

        {/* Quick Actions */}
        <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '0.875rem' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Manage Users',        sub: 'Add, edit, manage balances', icon: UserGroupIcon,             color: '#6366f1', path: '/admin/users' },
              { label: 'Manifest Operations', sub: 'Review & approve jobs',      icon: Squares2X2Icon,            color: '#ef4444', path: '/admin/manifest' },
              { label: 'Vendor Management',   sub: 'API & manifest vendors',     icon: BuildingStorefrontIcon,    color: '#22c55e', path: '/admin/vendors' },
              { label: 'Live Activity',        sub: 'Real-time platform feed',   icon: TruckIcon,                 color: '#0ea5e9', path: '/activity' },
            ].map(({ label, sub, icon: Icon, color, path }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.65rem 0.75rem', borderRadius: 10,
                  border: '1.5px solid var(--navy-100)',
                  background: '#fff', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.background = `${color}08`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--navy-100)'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon style={{ width: 15, height: 15, color }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)' }}>{label}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Signups */}
        <div className="sh-card">
          <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserPlusIcon style={{ width: 15, height: 15, color: '#6366f1' }} />
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Recent Signups</h3>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/admin/users')}>
              All users →
            </button>
          </div>
          {recentUsers.length === 0 ? (
            <div className="empty-state"><UserGroupIcon style={{ width: 32, height: 32 }} /><p>No users yet.</p></div>
          ) : (
            <div>
              {recentUsers.map((u: any) => (
                <div
                  key={u._id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--navy-50, #f8fafc)' }}
                >
                  <div className="avatar avatar-sm avatar-indigo" style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                    {u.firstName?.charAt(0)}{u.lastName?.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.firstName} {u.lastName}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                  </div>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, textTransform: 'capitalize',
                    background: u.role === 'admin' ? '#fef3c7' : u.role === 'reseller' ? '#ede9fe' : '#f0f9ff',
                    color:      u.role === 'admin' ? '#92400e' : u.role === 'reseller' ? '#5b21b6' : '#0369a1',
                  }}>{u.role}</span>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: u.isActive ? '#22c55e' : '#ef4444',
                  }} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', whiteSpace: 'nowrap' }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default AdminDashboard;
