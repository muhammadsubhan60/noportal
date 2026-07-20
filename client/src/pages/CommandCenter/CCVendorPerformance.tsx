import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { CalendarDaysIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

type Tab = 'vendors' | 'daily';

interface VendorStat {
  _id: string; carrier: string; portal: string; total: number;
  delivered: number; in_transit: number; out_for_delivery: number;
  exception_problem: number; returned_to_sender: number;
  pending_pickup: number; delayed: number; not_scanned_yet: number; voided: number;
}

interface DayStat {
  _id: string; total: number;
  delivered: number; in_transit: number; out_for_delivery: number;
  exception_problem: number; returned_to_sender: number; not_scanned_yet: number; voided: number;
}

type Period = 'all' | 'this_month' | 'last_month' | 'this_year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all',        label: 'All Time'   },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_year',  label: 'This Year'  },
];

type VSortKey = 'vendor' | 'carrier' | 'total' | 'voided' | 'scanRate' | 'deliveryRate' | 'errorRate' | 'inTransit' | 'returned' | 'notScanned';
type DSortKey = 'date' | 'total' | 'voided' | 'scanRate' | 'deliveryRate' | 'errorRate' | 'delivered' | 'inTransit' | 'outForDelivery' | 'returned' | 'notScanned';
type Dir = 'asc' | 'desc';

function getPeriodRange(p: Period): { from?: string; to?: string } {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'all')        return {};
  if (p === 'this_month') return { from: fmt(new Date(y, m, 1)),     to: fmt(now) };
  if (p === 'last_month') return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
  if (p === 'this_year')  return { from: fmt(new Date(y, 0, 1)),     to: fmt(now) };
  return {};
}

function effectiveTotal(v: VendorStat | DayStat): number {
  return v.total - (v.voided || 0);
}
function deliveryRate(v: VendorStat | DayStat): number {
  const eff = effectiveTotal(v);
  if (!eff) return 0;
  return Math.round((v.delivered / eff) * 100);
}
function scanRate(v: VendorStat | DayStat): number {
  const eff = effectiveTotal(v);
  if (!eff) return 0;
  return Math.round(((eff - (v.not_scanned_yet || 0)) / eff) * 100);
}
function errorRate(v: VendorStat | DayStat): number {
  const eff = effectiveTotal(v);
  if (!eff) return 0;
  return Math.round(((v.exception_problem || 0) / eff) * 100);
}

// Bayesian volume-adjusted composite score.
//
// rawScore = DEL × (SCN + (100 − ERR)) / 200
//
// DEL is a multiplier — 0% delivery always produces 0 score, no matter how
// good scan rate or error rate look. A vendor that scans 100% but delivers 0%
// (all exceptions) correctly scores 0.
// Max possible rawScore = 100 × (100 + 100) / 200 = 100 pts.
//
// volumeFactor = n / (n + K), K=100
// Dampens rates for low-volume vendors. 1 label → 1% weight, 2855 labels → 97% weight.
const VOLUME_THRESHOLD = 100;

function compositeScore(v: VendorStat): number {
  const eff = effectiveTotal(v);
  if (!eff) return 0;
  const del = deliveryRate(v);
  const scn = scanRate(v);
  const err = errorRate(v);
  const rawScore = del * (scn + (100 - err)) / 200;
  const volumeFactor = eff / (eff + VOLUME_THRESHOLD);
  return Math.round(rawScore * volumeFactor * 10) / 10;
}

const CARRIER_COLOR: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#5B21B6', DHL: '#B45309',
};

const PORTAL_LABEL: Record<string, { name: string; color: string }> = {
  shippershub: { name: 'ShippersHub', color: '#6366f1' },
  labelcrow:   { name: 'LabelCrow',   color: '#0ea5e9' },
  shiplabel:   { name: 'ShipLabel',   color: '#10b981' },
  manual:      { name: 'Manual',      color: '#94a3b8' },
};

const inp: React.CSSProperties = { height: 34, padding: '0 0.7rem', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.8rem', fontFamily: FONT, outline: 'none', boxSizing: 'border-box' };

const thBase: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };

function SortIndicator({ active, dir }: { active: boolean; dir: Dir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: '0.6rem' }}>
      {active ? (dir === 'asc' ? '▲' : '▼') : '▲▼'}
    </span>
  );
}

function RatesCell({ scanned, sRate, sColor, delivered, dRate, dColor, errors, eRate }: {
  scanned: number; sRate: number; sColor: string;
  delivered: number; dRate: number; dColor: string;
  errors: number; eRate: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)' }}>SCN</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-800)' }}>{scanned.toLocaleString()}</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', background: sColor, padding: '1px 4px', borderRadius: 99 }}>{sRate}%</span>
      </div>
      <span style={{ color: 'var(--navy-200)' }}>·</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)' }}>DEL</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-800)' }}>{delivered.toLocaleString()}</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', background: dColor, padding: '1px 4px', borderRadius: 99 }}>{dRate}%</span>
      </div>
      {errors > 0 && <>
        <span style={{ color: 'var(--navy-200)' }}>·</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy-400)' }}>ERR</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626' }}>{errors.toLocaleString()}</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', background: '#dc2626', padding: '1px 4px', borderRadius: 99 }}>{eRate}%</span>
        </div>
      </>}
    </div>
  );
}

export default function CCVendorPerformance() {
  const { token } = useAuth();
  const [tab,      setTab]      = useState<Tab>('vendors');
  const [period,   setPeriod]   = useState<Period>('this_month');
  const [showDrop, setShowDrop] = useState(false);
  const [vendors,  setVendors]  = useState<VendorStat[]>([]);
  const [days,     setDays]     = useState<DayStat[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,      setSearch]      = useState('');
  const [showFormula, setShowFormula] = useState(false);

  // Vendor tab sort
  const [vSort, setVSort] = useState<VSortKey>('total');
  const [vDir,  setVDir]  = useState<Dir>('desc');

  // Daily tab sort
  const [dSort, setDSort] = useState<DSortKey>('date');
  const [dDir,  setDDir]  = useState<Dir>('desc');

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodRange(period);
    const params: Record<string, string> = {};
    if (from) params.dateFrom = from;
    if (to)   params.dateTo   = to;

    const reqs = [
      axios.get(`${API_BASE}/labels/vendor-stats`, { headers: authH(), params }),
    ];
    if (tab === 'daily') {
      reqs.push(axios.get(`${API_BASE}/labels/daily-stats`, { headers: authH(), params }));
    }

    Promise.all(reqs)
      .then(([vr, dr]) => {
        setVendors(vr.data.vendors || []);
        if (dr) setDays(dr.data.days || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, tab, authH]);

  function toggleVSort(key: VSortKey) {
    if (vSort === key) setVDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setVSort(key); setVDir('desc'); }
  }
  function toggleDSort(key: DSortKey) {
    if (dSort === key) setDDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setDSort(key); setDDir('desc'); }
  }

  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? 'This Month';

  const filtered = vendors.filter(v =>
    !search || v._id?.toLowerCase().includes(search.toLowerCase())
  );

  function vSortVal(v: VendorStat, k: VSortKey): number | string {
    switch (k) {
      case 'vendor':       return v._id || '';
      case 'carrier':      return v.carrier || '';
      case 'total':        return effectiveTotal(v);
      case 'voided':       return v.voided || 0;
      case 'scanRate':     return scanRate(v);
      case 'deliveryRate': return deliveryRate(v);
      case 'errorRate':    return errorRate(v);
      case 'inTransit':    return v.in_transit;
      case 'returned':     return v.returned_to_sender;
      case 'notScanned':   return v.not_scanned_yet;
    }
  }
  function dSortVal(d: DayStat, k: DSortKey): number | string {
    switch (k) {
      case 'date':           return d._id;
      case 'total':          return effectiveTotal(d);
      case 'voided':         return d.voided || 0;
      case 'scanRate':       return scanRate(d);
      case 'deliveryRate':   return deliveryRate(d);
      case 'errorRate':      return errorRate(d);
      case 'delivered':      return d.delivered;
      case 'inTransit':      return d.in_transit;
      case 'outForDelivery': return d.out_for_delivery;
      case 'returned':       return d.returned_to_sender;
      case 'notScanned':     return d.not_scanned_yet;
    }
  }

  function sortArr<T>(arr: T[], val: (x: T) => number | string, dir: Dir): T[] {
    return [...arr].sort((a, b) => {
      const av = val(a), bv = val(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  const sortedVendors = sortArr(filtered, v => vSortVal(v, vSort), vDir);
  const sortedDays    = sortArr(days,     d => dSortVal(d, dSort), dDir);

  // Ranks + scores computed from full vendor list — stable regardless of filter/sort
  const vendorScores = new Map<string, number>(vendors.map(v => [v._id, compositeScore(v)]));
  const vendorRanks  = new Map<string, number>(
    [...vendors]
      .filter(v => effectiveTotal(v) > 0)
      .sort((a, b) => compositeScore(b) - compositeScore(a))
      .map((v, i) => [v._id, i + 1])
  );

  const totalLabels    = vendors.reduce((a, v) => a + v.total, 0);
  const totalVoided    = vendors.reduce((a, v) => a + (v.voided || 0), 0);
  const totalEffective = totalLabels - totalVoided;
  const totalDelivered = vendors.reduce((a, v) => a + v.delivered, 0);
  const avgRate        = totalEffective > 0 ? Math.round((totalDelivered / totalEffective) * 100) : 0;
  const eligibleVendors = vendors.filter(v => effectiveTotal(v) > 0);
  const best  = eligibleVendors.reduce((b, v) => compositeScore(v) > compositeScore(b) ? v : b, eligibleVendors[0]);
  const worst = eligibleVendors.reduce((w, v) => compositeScore(v) < compositeScore(w) ? v : w, eligibleVendors[0]);

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>Vendor Performance</h1>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>Delivery rates + status breakdown by vendor</div>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowDrop(d => !d)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0.5rem 0.9rem', borderRadius: 8, cursor: 'pointer', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', color: 'var(--navy-700)', fontSize: '0.8rem', fontWeight: 600, fontFamily: FONT }}>
            <CalendarDaysIcon style={{ width: 14, height: 14 }} /> {periodLabel}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {showDrop && (
            <>
              <div onClick={() => setShowDrop(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
              <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--bg-card)', border: '1.5px solid var(--navy-200)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 10, minWidth: 150, overflow: 'hidden' }}>
                {PERIODS.map(p => (
                  <button key={p.key} onClick={() => { setPeriod(p.key); setShowDrop(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.55rem 1rem', background: period === p.key ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: period === p.key ? 700 : 400, color: period === p.key ? '#6366f1' : 'var(--navy-700)', fontFamily: FONT }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Vendors', value: vendors.length,                  color: '#6366f1' },
          { label: 'Total Labels',  value: totalEffective.toLocaleString(),  color: '#64748b' },
          { label: 'Voided',        value: totalVoided.toLocaleString(),     color: '#94a3b8' },
          { label: 'Avg Rate',      value: `${avgRate}%`,                    color: '#22c55e' },
          { label: 'Best Vendor',   value: best  ? `${compositeScore(best)} pts`  : '—', sub: best?._id,  sub2: best  ? `DEL ${deliveryRate(best)}% · SCN ${scanRate(best)}% · ERR ${errorRate(best)}%`  : '', color: '#10b981' },
          { label: 'Lowest Vendor', value: worst ? `${compositeScore(worst)} pts` : '—', sub: worst?._id, sub2: worst ? `DEL ${deliveryRate(worst)}% · SCN ${scanRate(worst)}% · ERR ${errorRate(worst)}%` : '', color: '#ef4444' },
        ].map(c => (
          <div key={c.label} className="db-card" style={{ padding: '0.9rem 1rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.color, borderRadius: '16px 16px 0 0' }} />
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1 }}>{c.value}</div>
            {'sub' in c && c.sub && <div style={{ fontSize: '0.68rem', color: 'var(--navy-700)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</div>}
            {'sub2' in c && c.sub2 && <div style={{ fontSize: '0.6rem', color: 'var(--navy-400)', marginTop: 2 }}>{c.sub2}</div>}
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-400)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Scoring formula panel ──────────────────────────────── */}
      <div className="db-card" style={{ marginBottom: '1.25rem', overflow: 'hidden' }}>
        <button onClick={() => setShowFormula(f => !f)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--navy-700)', letterSpacing: '-0.2px' }}>How Vendor Scoring Works</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.1)', padding: '2px 7px', borderRadius: 99 }}>Formula Guide</span>
          </div>
          {showFormula
            ? <ChevronUpIcon style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />
            : <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />}
        </button>

        {showFormula && (
          <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--navy-100)' }}>

            {/* Step 1 — Rates */}
            <div style={{ marginTop: '1rem', marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Step 1 — Compute the 3 rates (voided labels excluded from total)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8 }}>
                {[
                  { label: 'Scan Rate (SCN)', color: '#6366f1', formula: 'Scanned labels ÷ Effective total × 100', note: 'Scanned = total − not_scanned_yet − voided. Measures how many labels USPS physically picked up.' },
                  { label: 'Delivery Rate (DEL)', color: '#22c55e', formula: 'Delivered ÷ Effective total × 100', note: 'Primary success metric. How many packages actually reached the recipient.' },
                  { label: 'Error Rate (ERR)', color: '#dc2626', formula: 'Exception labels ÷ Effective total × 100', note: 'Lower is better. Exceptions = lost, damaged, or problem packages.' },
                ].map(r => (
                  <div key={r.label} style={{ background: `${r.color}08`, border: `1px solid ${r.color}20`, borderRadius: 10, padding: '0.65rem 0.85rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: r.color, marginBottom: 4 }}>{r.label}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: 'monospace', marginBottom: 4 }}>{r.formula}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)', lineHeight: 1.5 }}>{r.note}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2 — Raw Score */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Step 2 — Raw Score (DEL is a multiplier, not an addend)</div>
              <div style={{ background: 'var(--navy-50)', borderRadius: 10, padding: '0.75rem 1rem', border: '1px solid var(--navy-200)' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: 6 }}>
                  Raw Score = DEL × (SCN + (100 − ERR)) ÷ 200
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--navy-500)', lineHeight: 1.6 }}>
                  <div>· <strong>DEL is a multiplier</strong> — if delivery = 0%, the entire score is 0, regardless of scan or error rate.</div>
                  <div>· A perfect vendor (DEL=100%, SCN=100%, ERR=0%) scores exactly <strong>100 pts raw</strong>.</div>
                  <div>· A vendor that scans 100% but delivers 0% (all exceptions) scores <strong>0 pts</strong> — no credit for broken packages.</div>
                </div>
              </div>
            </div>

            {/* Step 3 — Volume Factor */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Step 3 — Volume Factor (Bayesian confidence)</div>
              <div style={{ background: 'var(--navy-50)', borderRadius: 10, padding: '0.75rem 1rem', border: '1px solid var(--navy-200)', marginBottom: 8 }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: 6 }}>
                  Volume Factor = n ÷ (n + 100)
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--navy-500)', lineHeight: 1.6 }}>
                  <div>· A vendor with <strong>1 label</strong> gets weight 1/101 = <strong>1%</strong> — their rate is almost meaningless statistically.</div>
                  <div>· A vendor with <strong>100 labels</strong> gets weight 100/200 = <strong>50%</strong> — halfway trusted.</div>
                  <div>· A vendor with <strong>500 labels</strong> gets weight 500/600 = <strong>83%</strong> — highly trusted.</div>
                  <div>· A vendor with <strong>2,855 labels</strong> gets weight 2855/2955 = <strong>97%</strong> — near full trust.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 6 }}>
                {[[1,'1%'],[10,'9%'],[50,'33%'],[100,'50%'],[200,'67%'],[500,'83%'],[1000,'91%'],[2855,'97%']].map(([n, pct]) => (
                  <div key={n} style={{ background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--navy-900)' }}>{pct}</div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--navy-400)', marginTop: 1 }}>{Number(n).toLocaleString()} labels</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 4 — Final Score */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Step 4 — Final Score</div>
              <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(16,185,129,0.06))', border: '1.5px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '0.75rem 1rem' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.92rem', fontWeight: 800, color: '#6366f1', marginBottom: 6 }}>
                  Final Score = Raw Score × Volume Factor
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--navy-500)' }}>Rounded to 1 decimal. Max possible = 100 pts (perfect rates + infinite volume).</div>
              </div>
            </div>

            {/* Worked example */}
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Worked Example</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
                {[
                  { name: 'USPS Ground 9234', labels: 1,   del: 100, scn: 100, err: 0,   good: false, note: 'Only 1 label — statistically meaningless' },
                  { name: 'USPS Priority 9505', labels: 5, del: 0,   scn: 100, err: 100, good: false, note: 'DEL=0% → score is always 0' },
                  { name: 'USPS Stamps 9302',  labels: 471, del: 83,  scn: 94,  err: 1,   good: true,  note: 'High volume + clean metrics → top rank' },
                  { name: 'USPS Priority 9201',labels: 2855,del: 70,  scn: 85,  err: 11,  good: false, note: 'High volume but lower delivery rate' },
                ].map(ex => {
                  const rawScore = ex.del * (ex.scn + (100 - ex.err)) / 200;
                  const volFactor = ex.labels / (ex.labels + 100);
                  const final = Math.round(rawScore * volFactor * 10) / 10;
                  return (
                    <div key={ex.name} style={{ background: 'var(--bg-card)', border: `1px solid ${ex.good ? 'rgba(34,197,94,0.3)' : 'var(--navy-200)'}`, borderRadius: 10, padding: '0.65rem 0.85rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--navy-800)', marginBottom: 6 }}>{ex.name}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--navy-500)', lineHeight: 1.8, fontFamily: 'monospace' }}>
                        <div>DEL={ex.del}%  SCN={ex.scn}%  ERR={ex.err}%</div>
                        <div>Raw = {ex.del} × ({ex.scn}+{100-ex.err}) ÷ 200 = <strong>{rawScore.toFixed(1)}</strong></div>
                        <div>Vol = {ex.labels} ÷ ({ex.labels}+100) = <strong>{(volFactor*100).toFixed(0)}%</strong></div>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--navy-400)' }}>{ex.note}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: final >= 50 ? '#22c55e' : final > 0 ? '#f59e0b' : '#ef4444' }}>{final} pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--navy-200)', marginBottom: '1.25rem' }}>
        {([['vendors', 'Vendors'], ['daily', 'Daily View']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '0.6rem 1.2rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: tab === t ? 700 : 500, color: tab === t ? '#6366f1' : 'var(--navy-500)', borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent', marginBottom: -2, fontFamily: FONT, transition: 'color 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Vendors tab ────────────────────────────────────────── */}
      {tab === 'vendors' && (
        <>
          <div style={{ marginBottom: '0.85rem' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor…" style={{ ...inp, width: '100%', maxWidth: 260 }} />
          </div>
          <div className="db-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT }}>
                <thead>
                  <tr style={{ background: 'var(--navy-50)', borderBottom: '1.5px solid var(--navy-200)' }}>
                    {([
                      ['Vendor',  'vendor'],
                      ['Carrier', 'carrier'],
                    ] as [string, VSortKey][]).map(([label, key]) => (
                      <th key={key} onClick={() => toggleVSort(key)} style={{ ...thBase, color: vSort === key ? '#6366f1' : 'var(--navy-500)' }}>
                        {label}<SortIndicator active={vSort === key} dir={vDir} />
                      </th>
                    ))}
                    <th style={{ ...thBase, cursor: 'default' }}>Portal</th>
                    {([
                      ['Total',  'total'],
                      ['Voided', 'voided'],
                    ] as [string, VSortKey][]).map(([label, key]) => (
                      <th key={key} onClick={() => toggleVSort(key)} style={{ ...thBase, color: vSort === key ? '#6366f1' : 'var(--navy-500)' }}>
                        {label}<SortIndicator active={vSort === key} dir={vDir} />
                      </th>
                    ))}
                    <th style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {([['SCN', 'scanRate', '#6366f1'], ['DEL', 'deliveryRate', '#22c55e'], ['ERR', 'errorRate', '#dc2626']] as [string, VSortKey, string][]).map(([label, key, color]) => (
                          <button key={key} onClick={() => toggleVSort(key)} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 6px', borderRadius: 99, border: `1.5px solid ${vSort === key ? color : 'var(--navy-200)'}`, background: vSort === key ? `${color}15` : 'transparent', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, color: vSort === key ? color : 'var(--navy-400)', fontFamily: FONT }}>
                            {label}{vSort === key && <span style={{ fontSize: '0.55rem' }}>{vDir === 'asc' ? '▲' : '▼'}</span>}
                          </button>
                        ))}
                      </div>
                    </th>
                    {([
                      ['In Transit',  'inTransit'],
                      ['Returned',    'returned'],
                      ['Not Scanned', 'notScanned'],
                    ] as [string, VSortKey][]).map(([label, key]) => (
                      <th key={key} onClick={() => toggleVSort(key)} style={{ ...thBase, color: vSort === key ? '#6366f1' : 'var(--navy-500)' }}>
                        {label}<SortIndicator active={vSort === key} dir={vDir} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <td key={j} style={{ padding: '10px 12px' }}>
                            <div style={{ height: 10, borderRadius: 5, background: 'var(--navy-100)', animation: 'bl-shimmer 1.5s infinite' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : sortedVendors.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)' }}>No vendor data</td></tr>
                  ) : (
                    sortedVendors.map(v => {
                      const dRate = deliveryRate(v);
                      const sRate = scanRate(v);
                      const eRate = errorRate(v);
                      const dColor = dRate >= 90 ? '#22c55e' : dRate >= 75 ? '#f59e0b' : '#ef4444';
                      const sColor = sRate >= 90 ? '#6366f1' : sRate >= 70 ? '#f59e0b' : '#ef4444';
                      const cColor = CARRIER_COLOR[v.carrier] || '#64748b';
                      const eff    = effectiveTotal(v);
                      return (
                        <tr key={v._id} style={{ borderBottom: '1px solid var(--navy-100)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              {(() => {
                                const rank  = vendorRanks.get(v._id);
                                const score = vendorScores.get(v._id) ?? 0;
                                if (!rank) return null;
                                const bg = rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : 'var(--navy-200)';
                                const fg = rank <= 3 ? '#fff' : 'var(--navy-500)';
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, borderRadius: '50%', background: bg, color: fg, fontSize: '0.6rem', fontWeight: 800 }}>{rank}</span>
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--navy-400)', marginTop: 1 }}>{score}</span>
                                  </div>
                                );
                              })()}
                              <div style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{v._id || '—'}</div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: cColor, background: `${cColor}15`, border: `1px solid ${cColor}30`, padding: '2px 7px', borderRadius: 5 }}>{v.carrier || '—'}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {(() => {
                              const p = PORTAL_LABEL[v.portal] || { name: v.portal || 'ShippersHub', color: '#6366f1' };
                              return <span style={{ fontSize: '0.68rem', fontWeight: 700, color: p.color, background: `${p.color}12`, border: `1px solid ${p.color}25`, padding: '2px 8px', borderRadius: 5 }}>{p.name}</span>;
                            })()}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--navy-800)' }}>{eff.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 600 }}>{(v.voided || 0).toLocaleString()}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <RatesCell
                              scanned={eff - (v.not_scanned_yet || 0)} sRate={sRate} sColor={sColor}
                              delivered={v.delivered} dRate={dRate} dColor={dColor}
                              errors={v.exception_problem} eRate={eRate}
                            />
                          </td>
                          <td style={{ padding: '10px 12px', color: '#1d4ed8' }}>{v.in_transit}</td>
                          <td style={{ padding: '10px 12px', color: '#be123c' }}>{v.returned_to_sender}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--navy-400)' }}>{v.not_scanned_yet}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Daily tab ──────────────────────────────────────────── */}
      {tab === 'daily' && (
        <div className="db-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT }}>
              <thead>
                <tr style={{ background: 'var(--navy-50)', borderBottom: '1.5px solid var(--navy-200)' }}>
                  {([
                    ['Date',    'date'],
                    ['Total',   'total'],
                    ['Voided',  'voided'],
                  ] as [string, DSortKey][]).map(([label, key]) => (
                    <th key={key} onClick={() => toggleDSort(key)} style={{ ...thBase, color: dSort === key ? '#6366f1' : 'var(--navy-500)' }}>
                      {label}<SortIndicator active={dSort === key} dir={dDir} />
                    </th>
                  ))}
                  <th style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {([['SCN', 'scanRate', '#6366f1'], ['DEL', 'deliveryRate', '#22c55e'], ['ERR', 'errorRate', '#dc2626']] as [string, DSortKey, string][]).map(([label, key, color]) => (
                        <button key={key} onClick={() => toggleDSort(key)} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 6px', borderRadius: 99, border: `1.5px solid ${dSort === key ? color : 'var(--navy-200)'}`, background: dSort === key ? `${color}15` : 'transparent', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, color: dSort === key ? color : 'var(--navy-400)', fontFamily: FONT }}>
                          {label}{dSort === key && <span style={{ fontSize: '0.55rem' }}>{dDir === 'asc' ? '▲' : '▼'}</span>}
                        </button>
                      ))}
                    </div>
                  </th>
                  {([
                    ['Delivered',        'delivered'],
                    ['In Transit',       'inTransit'],
                    ['Out for Delivery', 'outForDelivery'],
                    ['Returned',         'returned'],
                    ['Not Scanned',      'notScanned'],
                  ] as [string, DSortKey][]).map(([label, key]) => (
                    <th key={key} onClick={() => toggleDSort(key)} style={{ ...thBase, color: dSort === key ? '#6366f1' : 'var(--navy-500)' }}>
                      {label}<SortIndicator active={dSort === key} dir={dDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 9 }).map((_, j) => <td key={j} style={{ padding: '10px 12px' }}><div style={{ height: 10, borderRadius: 5, background: 'var(--navy-100)', animation: 'bl-shimmer 1.5s infinite' }} /></td>)}</tr>
                  ))
                ) : sortedDays.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--navy-400)' }}>No daily data</td></tr>
                ) : (
                  sortedDays.map(d => {
                    const dRate = deliveryRate(d);
                    const sRate = scanRate(d);
                    const eRate = errorRate(d);
                    const dColor = dRate >= 90 ? '#22c55e' : dRate >= 75 ? '#f59e0b' : '#ef4444';
                    const sColor = sRate >= 90 ? '#6366f1' : sRate >= 70 ? '#f59e0b' : '#ef4444';
                    const eff    = effectiveTotal(d);
                    const dateLabel = new Date(d._id + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <tr key={d._id} style={{ borderBottom: '1px solid var(--navy-100)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--navy-800)', whiteSpace: 'nowrap' }}>{dateLabel}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--navy-800)' }}>{eff.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 600 }}>{(d.voided || 0).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <RatesCell
                            scanned={eff - (d.not_scanned_yet || 0)} sRate={sRate} sColor={sColor}
                            delivered={d.delivered} dRate={dRate} dColor={dColor}
                            errors={d.exception_problem} eRate={eRate}
                          />
                        </td>
                        <td style={{ padding: '10px 12px', color: '#15803d', fontWeight: 600 }}>{d.delivered}</td>
                        <td style={{ padding: '10px 12px', color: '#1d4ed8' }}>{d.in_transit}</td>
                        <td style={{ padding: '10px 12px', color: '#6d28d9' }}>{d.out_for_delivery}</td>
                        <td style={{ padding: '10px 12px', color: '#be123c' }}>{d.returned_to_sender}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--navy-400)' }}>{d.not_scanned_yet}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
