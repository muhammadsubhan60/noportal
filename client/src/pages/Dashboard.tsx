import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  CurrencyDollarIcon, TagIcon, ClipboardDocumentListIcon,
  UserGroupIcon, ArrowUpRightIcon, ClockIcon, SparklesIcon,
  InformationCircleIcon, ArrowTrendingUpIcon, ChevronDownIcon,
  ArrowUpTrayIcon, CalendarDaysIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserStats {
  balance: { currentBalance: number; totalDeposited: number; totalSpent: number };
  labels:  { total: number; generated: number; failed: number; spent: number; byCarrier: Record<string, number> };
  manifests: { total: number; active: number; completed: number; cancelled: number };
  savings: { total: number; labelCount: number };
  recentLabels:   any[];
  activeManifests: any[];
  trackingStatus?: {
    not_scanned_yet: number; in_transit: number; out_for_delivery: number; delivered: number;
    exception_problem: number; returned_to_sender: number; pending_pickup: number; delayed: number;
  };
}

interface VendorAccessItem {
  vendorId: string;
  vendorName: string;
  carrier: string;
  vendorType: 'api' | 'manifest';
  shippingService: string;
  baseRate: number;
  isAllowed: boolean;
  rateTiers: Array<{ minLbs: number; maxLbs: number | null; rate: number }>;
}

interface ResellerStats {
  clientCount:    number;
  activeClients:  number;
  myBalance:  { currentBalance: number; totalDeposited: number; totalSpent: number };
  labels:     { total: number; revenue: number; byCarrier: Record<string, number> };
  manifests:  { total: number; active: number; completed: number; revenue: number };
  totalClientSpend: number;
  recentClients:  any[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (v: number) =>
  `$${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARRIER_COLORS: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#5B21B6', DHL: '#B45309',
};

const CARRIER_GRADIENT: Record<string, string> = {
  USPS: 'linear-gradient(90deg, #1D4ED8, #60A5FA)',
  UPS:  'linear-gradient(90deg, #92400E, #F59E0B)',
  FedEx:'linear-gradient(90deg, #5B21B6, #A78BFA)',
  DHL:  'linear-gradient(90deg, #B45309, #FCD34D)',
};

const MANIFEST_STATUS_COLOR: Record<string, string> = {
  open: '#6366f1', assigned: '#0ea5e9', accepted: '#0ea5e9',
  uploaded: '#f59e0b', under_review: '#ef4444', completed: '#22c55e',
  cancelled: '#94a3b8', rejected: '#f97316',
};

const MANIFEST_STATUS_LABEL: Record<string, string> = {
  open: 'Open', assigned: 'Assigned', accepted: 'Accepted',
  uploaded: 'Uploaded', under_review: 'Under Review',
  completed: 'Completed', cancelled: 'Cancelled', rejected: 'Rejected',
};

// ── MetricCard ────────────────────────────────────────────────────────────────
const MetricCard = ({
  label, value, sub, color, Icon, onClick, infoTooltip, ActionIcon, onActionClick,
}: {
  label: string; value: string | number; sub?: string;
  color: string; Icon: React.ElementType; onClick?: () => void;
  infoTooltip?: string;
  ActionIcon?: React.ElementType;
  onActionClick?: () => void;
}) => {
  const [showTip, setShowTip] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        borderRadius: 16,
        padding: '1.25rem 1.3rem 1.1rem',
        display: 'flex', flexDirection: 'column',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        border: '1px solid rgba(148,163,184,0.22)',
        boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-card)',
        transform: hovered && onClick ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
    >
      {/* Top gradient accent strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${color}, ${color}70)`,
        borderRadius: '16px 16px 0 0',
      }} />

      {/* Icon row + optional action + optional info */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: `linear-gradient(135deg, ${color}22, ${color}0d)`,
          border: `1px solid ${color}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon style={{ width: 19, height: 19, color }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {ActionIcon && onActionClick && (
            <button
              onClick={e => { e.stopPropagation(); onActionClick(); }}
              title="Adjust for lost items"
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                lineHeight: 1, display: 'flex', alignItems: 'center',
              }}
            >
              <ArrowUpTrayIcon style={{ width: 14, height: 14, color: '#94a3b8' }} />
            </button>
          )}

          {infoTooltip && (
            <div
              style={{ position: 'relative', lineHeight: 1 }}
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              onClick={e => e.stopPropagation()}
            >
              <InformationCircleIcon style={{ width: 14, height: 14, color: '#cbd5e1', cursor: 'help' }} />
              {showTip && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
                  background: '#1e293b', color: '#f1f5f9',
                  borderRadius: 10, padding: '10px 13px',
                  fontSize: '0.69rem', lineHeight: 1.6, fontWeight: 400,
                  width: 252, boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
                  pointerEvents: 'none',
                }}>
                  {infoTooltip}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Value */}
      <div style={{
        fontSize: '1.85rem', fontWeight: 800, color: 'var(--navy-900)',
        letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 4,
      }}>
        {value}
      </div>

      {/* Label */}
      <div style={{
        fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-500)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </div>

      {/* Sub — separated */}
      {sub && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--navy-100)',
          fontSize: '0.76rem', color: 'var(--navy-500)',
        }}>
          {sub}
        </div>
      )}
    </div>
  );
};

// ── QuickAction ───────────────────────────────────────────────────────────────
const QuickAction = ({ label, sub, Icon, color, onClick }: {
  label: string; sub: string; Icon: React.ElementType; color: string; onClick: () => void;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 13,
        padding: '0.9rem 1rem', borderRadius: 12,
        border: `1.5px solid ${hovered ? color + '55' : 'var(--navy-100)'}`,
        background: hovered ? `${color}08` : 'var(--bg-card)',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'all 0.15s',
        boxShadow: hovered ? `0 4px 14px ${color}22` : 'none',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(135deg, ${color}22, ${color}0e)`,
        border: `1px solid ${color}28`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 17, height: 17, color }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--navy-800)' }}>{label}</div>
        <div style={{ fontSize: '0.76rem', color: 'var(--navy-500)', marginTop: 1 }}>{sub}</div>
      </div>
      <ArrowUpRightIcon style={{
        width: 15, height: 15,
        color: hovered ? color : 'var(--navy-300)',
        transform: hovered ? 'translate(1px,-1px)' : 'none',
        transition: 'color 0.15s, transform 0.15s',
        flexShrink: 0,
      }} />
    </button>
  );
};

// ── Section header with left accent bar ───────────────────────────────────────
const SectionHeader = ({ title, action, accent = 'var(--accent-500)' }: {
  title: string; action?: React.ReactNode; accent?: string;
}) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ width: 3, height: 16, borderRadius: 3, background: accent, flexShrink: 0 }} />
      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>{title}</h3>
    </div>
    {action}
  </div>
);

const DashboardFAQ = () => {
  const faqs = [
    {
      q: 'How do credits work?',
      a: 'Credits are deducted per label based on template and weight. Your added credits are shown in the history table.',
    },
    {
      q: 'How can I add more credits?',
      a: 'Ask admin to add credits. It will instantly appear in "Added balance history".',
    },
    {
      q: 'What if I run out of credits during bulk upload?',
      a: 'Bulk generation should stop if balance is insufficient. Add credits and re-upload.',
    },
  ];

  return (
    <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
      <SectionHeader title="Frequently asked questions" accent="var(--navy-300)" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {faqs.map((faq) => (
          <details
            key={faq.q}
            style={{
              border: '1px solid var(--navy-200)',
              borderRadius: 12,
              background: 'var(--navy-50)',
              overflow: 'hidden',
            }}
          >
            <summary
              style={{
                listStyle: 'none',
                cursor: 'pointer',
                padding: '0.85rem 1rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--navy-800)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              {faq.q}
              <ChevronDownIcon style={{ width: 16, height: 16, color: 'var(--navy-500)', flexShrink: 0 }} />
            </summary>
            <div
              style={{
                padding: '0.7rem 1rem 0.9rem',
                fontSize: '0.8rem',
                color: 'var(--navy-600)',
                lineHeight: 1.65,
                borderTop: '1px solid var(--navy-200)',
                background: 'var(--bg-card)',
              }}
            >
              {faq.a}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
};

// ── Hero Banner (shared) ───────────────────────────────────────────────────────
const HeroBanner = ({ greeting, name, dateLabel, balanceLabel, balance, onCta }: {
  greeting: string; name: string; dateLabel: string;
  balanceLabel: string; balance: string; onCta: () => void;
}) => (
  <div style={{
    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
    borderRadius: 20, padding: '1.75rem 2rem',
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
  }}>
    {/* Radial glow blobs */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'radial-gradient(ellipse 60% 80% at 10% 50%, rgba(59,130,246,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 60% at 90% 20%, rgba(139,92,246,0.13) 0%, transparent 70%)',
    }} />
    {/* Dot-grid texture */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.1,
      backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
      backgroundSize: '22px 22px',
    }} />

    <div style={{ position: 'relative', zIndex: 1 }}>
      <p style={{ color: 'rgba(148,163,184,0.72)', fontSize: '0.75rem', fontWeight: 500, margin: '0 0 5px', letterSpacing: '0.02em' }}>
        {dateLabel}
      </p>
      <h1 style={{ color: '#fff', fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 6px' }}>
        {greeting}, {name}!
      </h1>
      <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: 0 }}>
        Here's your shipping activity overview.
      </p>
    </div>

    <div style={{ position: 'relative', zIndex: 1, textAlign: 'right', flexShrink: 0 }}>
      <p style={{ color: 'rgba(148,163,184,0.62)', fontSize: '0.68rem', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {balanceLabel}
      </p>
      <p style={{ color: '#fff', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
        {balance}
      </p>
      <button
        onClick={onCta}
        style={{
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          color: '#fff', padding: '6px 18px', borderRadius: 8,
          fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
      >
        Add Balance →
      </button>
    </div>
  </div>
);

// ── AddBalanceModal ───────────────────────────────────────────────────────────
const AddBalanceModal = ({
  open, onClose,
}: { open: boolean; onClose: () => void }) => {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', borderRadius: 20, padding: '2rem 2.25rem',
          border: '1px solid var(--navy-200)',
          maxWidth: 440, width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #22c55e22, #22c55e0d)', border: '1px solid #22c55e28',
            }}>
              <CurrencyDollarIcon style={{ width: 22, height: 22, color: '#22c55e' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy-800)' }}>Add Balance</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--navy-500)' }}>Account top-up</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.2rem', lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Message */}
        <div style={{
          background: 'var(--success-50)', border: '1px solid var(--success-100)', borderRadius: 12,
          padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <p style={{ margin: 0, fontSize: '0.87rem', color: 'var(--success-700)', fontWeight: 600, marginBottom: 4 }}>
            Ready to recharge?
          </p>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--success-700)', lineHeight: 1.55 }}>
            To add balance to your account, please contact your <strong>account manager</strong> or our <strong>sales team</strong>. They will process your top-up and confirm once funds are credited.
          </p>
        </div>

        {/* Contact options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.5rem' }}>
          <a
            href="mailto:support@shipmehub.com"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.75rem 1rem', borderRadius: 10,
              background: 'var(--navy-50)', border: '1px solid var(--navy-200)',
              color: 'var(--navy-700)', textDecoration: 'none',
              fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            <span style={{ fontSize: '1rem' }}>📧</span>
            support@shipmehub.com
          </a>
          <a
            href="https://wa.me/message/shipmehub"
            target="_blank" rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.75rem 1rem', borderRadius: 10,
              background: 'var(--success-50)', border: '1px solid var(--success-100)',
              color: 'var(--success-700)', textDecoration: 'none',
              fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            <span style={{ fontSize: '1rem' }}>💬</span>
            WhatsApp Support
          </a>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '0.65rem', borderRadius: 10,
              background: 'var(--navy-100)', border: '1px solid var(--navy-200)',
              color: 'var(--navy-600)', fontWeight: 600,
              fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ── LossAdjustDrawer ──────────────────────────────────────────────────────────
const LOSS_KEY = 'savings_loss_per_item';

const LossAdjustModal = ({
  open, onClose, exceptionCount, savingsTotal, onApply,
}: {
  open: boolean; onClose: () => void;
  exceptionCount: number; savingsTotal: number;
  onApply: (perItem: number) => void;
}) => {
  const [raw, setRaw] = useState(() => localStorage.getItem(LOSS_KEY) ?? '');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      // tiny delay so the CSS transition fires after mount
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [open]);

  if (!open && !mounted) return null;

  const perItem   = parseFloat(raw) || 0;
  const totalLoss = exceptionCount * perItem;
  const adjusted  = savingsTotal - totalLoss;

  const handleApply = () => {
    if (raw) localStorage.setItem(LOSS_KEY, raw);
    onApply(perItem);
    onClose();
  };

  const handleClear = () => {
    setRaw('');
    localStorage.removeItem(LOSS_KEY);
    onApply(0);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: mounted ? 'rgba(15,23,42,0.45)' : 'rgba(15,23,42,0)',
          backdropFilter: mounted ? 'blur(3px)' : 'none',
          transition: 'background 0.28s, backdrop-filter 0.28s',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed', top: '50%', right: 24, zIndex: 1001,
          transform: mounted ? 'translateX(0) translateY(-50%)' : 'translateX(calc(100% + 24px)) translateY(-50%)',
          width: 360,
          maxHeight: 'min(580px, 90vh)',
          background: 'var(--bg-card)',
          borderRadius: 16,
          border: '1px solid var(--navy-200)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* ── Drawer header ── */}
        <div style={{
          padding: '1.4rem 1.6rem 1.2rem',
          borderBottom: '1px solid var(--navy-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #f9731622, #f9731608)',
              border: '1px solid #f9731628',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ArrowUpTrayIcon style={{ width: 17, height: 17, color: '#f97316' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-900)', lineHeight: 1.2 }}>
                Loss Adjustment
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 2 }}>
                Adjusts Total Savings &amp; ROI
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid var(--navy-200)',
              background: 'var(--navy-50)', cursor: 'pointer', color: 'var(--navy-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.9rem', flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

          {/* Exception stat */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              From your tracking records
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.1rem', borderRadius: 12,
              background: '#fff5f5', border: '1px solid #fecaca',
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>Exception / Problem</div>
                <div style={{ fontSize: '0.72rem', color: '#b91c1c', marginTop: 2 }}>Labels flagged in tracking</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#dc2626', letterSpacing: '-0.04em', lineHeight: 1 }}>
                  {exceptionCount}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: 2 }}>labels</div>
              </div>
            </div>
          </div>

          {/* Input */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)', marginBottom: 8 }}>
              How much did you lose per item?
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                fontSize: '1rem', fontWeight: 700, color: 'var(--navy-400)', pointerEvents: 'none',
              }}>$</span>
              <input
                autoFocus
                type="number" min="0" step="0.01"
                value={raw}
                onChange={e => setRaw(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '0.75rem 0.9rem 0.75rem 1.75rem',
                  border: '1.5px solid var(--navy-200)', borderRadius: 10,
                  fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy-900)',
                  background: 'var(--bg-card)', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#f97316')}
                onBlur={e => (e.target.style.borderColor = 'var(--navy-200)')}
              />
            </div>
            <div style={{ fontSize: '0.71rem', color: 'var(--navy-400)', marginTop: 6 }}>
              Enter the average product value for lost items
            </div>
          </div>

          {/* Calculation breakdown */}
          <div style={{
            borderRadius: 12, overflow: 'hidden',
            border: '1px solid var(--navy-200)',
          }}>
            <div style={{ padding: '0.7rem 1rem', background: 'var(--navy-50)', borderBottom: '1px solid var(--navy-200)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Calculation
              </span>
            </div>
            {[
              { label: 'Original savings',  val: fmt$(savingsTotal),             color: '#10b981' },
              { label: `${exceptionCount} exceptions × ${fmt$(perItem)}`, val: `−${fmt$(totalLoss)}`, color: '#dc2626' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.65rem 1rem', borderBottom: '1px solid var(--navy-100)',
                fontSize: '0.82rem',
              }}>
                <span style={{ color: 'var(--navy-600)' }}>{label}</span>
                <span style={{ fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.8rem 1rem',
              background: adjusted >= 0 ? '#f0fdf4' : '#fff5f5',
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-800)' }}>Adjusted Savings</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: adjusted >= 0 ? '#10b981' : '#dc2626' }}>{fmt$(adjusted)}</span>
            </div>
          </div>

          {/* ROI note */}
          <div style={{
            padding: '0.75rem 1rem', borderRadius: 10,
            background: 'var(--navy-50)', border: '1px solid var(--navy-200)',
            fontSize: '0.76rem', color: 'var(--navy-500)', lineHeight: 1.55,
          }}>
            ROI on the dashboard will automatically recalculate using the adjusted savings figure.
          </div>
        </div>

        {/* ── Sticky footer ── */}
        <div style={{
          padding: '1.1rem 1.6rem',
          borderTop: '1px solid var(--navy-100)',
          display: 'flex', gap: 10, flexShrink: 0,
          background: 'var(--bg-card)',
        }}>
          <button
            onClick={handleClear}
            style={{
              flex: 1, padding: '0.7rem', borderRadius: 10,
              background: 'var(--navy-100)', border: '1px solid var(--navy-200)',
              color: 'var(--navy-600)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-200)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--navy-100)')}
          >
            Clear
          </button>
          <button
            onClick={handleApply}
            disabled={perItem <= 0}
            style={{
              flex: 2, padding: '0.7rem', borderRadius: 10,
              background: perItem > 0 ? '#f97316' : 'var(--navy-200)',
              border: 'none',
              color: perItem > 0 ? '#fff' : 'var(--navy-400)',
              fontWeight: 700, fontSize: '0.85rem',
              cursor: perItem > 0 ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s, opacity 0.15s',
              opacity: perItem > 0 ? 1 : 0.6,
            }}
            onMouseEnter={e => { if (perItem > 0) e.currentTarget.style.background = '#ea6c0a'; }}
            onMouseLeave={e => { if (perItem > 0) e.currentTarget.style.background = '#f97316'; }}
          >
            Apply Adjustment →
          </button>
        </div>
      </div>
    </>
  );
};

// ── User Dashboard ─────────────────────────────────────────────────────────────
const UserDashboard: React.FC<{ firstName: string }> = ({ firstName }) => {
  const navigate = useNavigate();
  const [stats, setStats]           = useState<UserStats | null>(null);
  const [vendorAccess, setVendorAccess] = useState<VendorAccessItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showAddBalance, setShowAddBalance] = useState(false);
  const [showLossModal, setShowLossModal]   = useState(false);
  const [lossPerItem, setLossPerItem] = useState<number>(() => {
    const saved = localStorage.getItem(LOSS_KEY);
    return saved ? parseFloat(saved) || 0 : 0;
  });

  // ── Tracking status filter ──────────────────────────────────────────────────
  const currentMonthStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [tsMonth,   setTsMonth]   = useState(currentMonthStr);
  const [tsCounts,  setTsCounts]  = useState<UserStats['trackingStatus'] | null>(null);
  const [tsLoading, setTsLoading] = useState(false);

  // Generate last 13 month options (current + 12 previous)
  const tsMonthOptions = (() => {
    const opts: { value: string; label: string }[] = [];
    const n = new Date();
    for (let i = 0; i < 13; i++) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      });
    }
    return opts;
  })();

  useEffect(() => {
    setTsLoading(true);
    const url = tsMonth ? `/stats/tracking-status?month=${tsMonth}` : '/stats/tracking-status';
    axios.get(url)
      .then(r => setTsCounts(r.data))
      .catch(() => {})
      .finally(() => setTsLoading(false));
  }, [tsMonth]);

  const load = useCallback(async () => {
    try {
      const [statsRes, accessRes] = await Promise.all([
        axios.get('/stats'),
        axios.get('/access/me').catch(() => ({ data: { access: [] } })),
      ]);
      setStats(statsRes.data);
      setVendorAccess((accessRes.data?.access || []).filter((v: VendorAccessItem) => v.isAllowed));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>;
  if (!stats)  return null;

  const { balance, labels, manifests, savings, recentLabels, activeManifests } = stats;
  const totalLabels = labels.total || 1;
  const exceptionCount  = stats.trackingStatus?.exception_problem ?? 0;
  const rawSavings      = savings?.total ?? 0;
  const adjustedSavings = rawSavings - exceptionCount * lossPerItem;
  const roi = balance.totalDeposited > 0 ? (adjustedSavings / balance.totalDeposited) * 100 : 0;
  const SAVINGS_TOOLTIP = 'This figure compares your label cost against standard USPS retail rates. Your actual savings may differ if you had prior negotiated rates. Think of this as an estimated benchmark — not a guaranteed fixed saving.';
  const now = new Date();
  const greeting  = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const accessByCarrier = vendorAccess.reduce((acc, item) => {
    if (!acc[item.carrier]) acc[item.carrier] = [];
    acc[item.carrier].push(item);
    return acc;
  }, {} as Record<string, VendorAccessItem[]>);
  const carrierOrder = ['USPS', 'UPS', 'FedEx', 'DHL'];
  const sortedCarriers = Object.keys(accessByCarrier).sort((a, b) => {
    const ai = carrierOrder.indexOf(a);
    const bi = carrierOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Hero */}
      <HeroBanner
        greeting={greeting} name={firstName} dateLabel={dateLabel}
        balanceLabel="Current Balance" balance={fmt$(balance.currentBalance)}
        onCta={() => setShowAddBalance(true)}
      />

      {/* KPI Grid */}
      <div className="dashboard-kpi-grid" style={{ display: 'grid', gap: '0.875rem' }}>
        <MetricCard label="Balance"          value={fmt$(balance.currentBalance)} sub={`${fmt$(balance.totalDeposited)} deposited`}                                       color="#22c55e" Icon={CurrencyDollarIcon}      onClick={() => navigate('/profile')} />
        <MetricCard label="Labels Generated" value={labels.generated}             sub={`${labels.failed} failed`}                                                         color="#0ea5e9" Icon={TagIcon}                 onClick={() => navigate('/labels/history')} />
        <MetricCard label="Active Manifests" value={manifests.active}             sub={`${manifests.completed} completed`}                                                color="#f59e0b" Icon={ClipboardDocumentListIcon} />
        <MetricCard label="Total Spent"      value={fmt$(balance.totalSpent)}     sub="Labels + manifests"                                                               color="#6366f1" Icon={CurrencyDollarIcon} />
        <MetricCard
          label="Total Savings"
          value={fmt$(adjustedSavings)}
          sub={lossPerItem > 0
            ? `Adjusted · ${exceptionCount} exceptions × ${fmt$(lossPerItem)}`
            : savings?.labelCount ? `vs USPS retail · ${savings.labelCount} labels` : 'vs USPS retail'}
          color="#10b981"
          Icon={SparklesIcon}
          infoTooltip={SAVINGS_TOOLTIP}
          ActionIcon={ArrowUpTrayIcon}
          onActionClick={() => setShowLossModal(true)}
        />
        <MetricCard label="ROI" value={`${roi.toFixed(1)}%`} sub={`${fmt$(adjustedSavings)} saved · ${fmt$(balance.totalDeposited)} deposited`} color="#8b5cf6" Icon={ArrowTrendingUpIcon} />
      </div>

      {/* Tracking Status Breakdown */}
      <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
        <SectionHeader
          title="Label Tracking Status"
          accent="#1D4ED8"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Month picker */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <CalendarDaysIcon style={{ position: 'absolute', left: 8, width: 13, height: 13, color: tsMonth ? '#1D4ED8' : 'var(--navy-400)', pointerEvents: 'none' }} />
                <select
                  value={tsMonth}
                  onChange={e => setTsMonth(e.target.value)}
                  style={{
                    height: 30, paddingLeft: 26, paddingRight: tsMonth ? 28 : 10,
                    border: `1.5px solid ${tsMonth ? '#BFDBFE' : 'var(--navy-200)'}`,
                    borderRadius: 8,
                    background: tsMonth ? '#EFF6FF' : 'var(--bg-card)',
                    color: tsMonth ? '#1D4ED8' : 'var(--navy-600)',
                    fontSize: '0.72rem', fontWeight: 600,
                    appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option value="">All Time</option>
                  {tsMonthOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                {/* Clear button inside select */}
                {tsMonth && (
                  <button
                    onClick={() => setTsMonth('')}
                    title="Show all time"
                    style={{
                      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', padding: 1, cursor: 'pointer',
                      color: '#1D4ED8', display: 'flex', alignItems: 'center',
                    }}
                  >
                    <XMarkIcon style={{ width: 11, height: 11 }} />
                  </button>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/history')}>
                View Labels →
              </button>
            </div>
          }
        />

        {tsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {([
              { key: 'not_scanned_yet',   label: 'Not Scanned Yet',    bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0', dot: '#94A3B8' },
              { key: 'in_transit',        label: 'In Transit',         bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
              { key: 'out_for_delivery',  label: 'Out for Delivery',   bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE', dot: '#8B5CF6' },
              { key: 'delivered',         label: 'Delivered',          bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
              { key: 'exception_problem', label: 'Exception / Problem',bg: '#FFF5F5', color: '#DC2626', border: '#FECACA', dot: '#EF4444' },
              { key: 'returned_to_sender',label: 'Returned to Sender', bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3', dot: '#F43F5E' },
              { key: 'pending_pickup',    label: 'Pending Pickup',     bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA', dot: '#F97316' },
              { key: 'delayed',           label: 'Delayed',            bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
            ] as const).map(({ key, label, bg, color, border, dot }) => {
              const count = tsCounts?.[key] ?? 0;
              return (
                <div key={key} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 12, padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: '0.68rem', color, opacity: 0.7 }}>label{count !== 1 ? 's' : ''}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mid row */}
      <div className="dashboard-two-col-grid" style={{ display: 'grid', gap: '1rem' }}>

        {/* Labels by Carrier */}
        <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
          <SectionHeader title="Labels by Carrier" accent="#1D4ED8" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {['USPS','UPS','FedEx','DHL'].map(c => {
              const count = labels.byCarrier[c] || 0;
              const pct   = Math.round((count / totalLabels) * 100);
              return (
                <div key={c}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-600)' }}>{c}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy-500)' }}>{count} · {pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: CARRIER_GRADIENT[c] || CARRIER_COLORS[c], borderRadius: 99, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '1rem', paddingTop: '0.875rem', borderTop: '1px solid var(--navy-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>Total Labels</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-800)' }}>{labels.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Active Manifest Jobs */}
        <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
          <SectionHeader
            title="Active Manifest Jobs"
            accent="#f59e0b"
            action={
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/bulk')}>
                Submit Job →
              </button>
            }
          />
          {activeManifests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.75rem 0', color: 'var(--navy-500)', fontSize: '0.84rem' }}>
              No active jobs.{' '}
              <button onClick={() => navigate('/labels/bulk')} style={{ background: 'none', border: 'none', color: 'var(--accent-600)', cursor: 'pointer', fontWeight: 600 }}>
                Submit one →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {activeManifests.map((job: any) => (
                <div
                  key={job._id}
                  onClick={() => navigate('/labels/bulk')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0.6rem 0.75rem',
                    background: 'var(--navy-50)', borderRadius: 10,
                    cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = 'var(--navy-100)'; el.style.borderColor = 'var(--navy-200)'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = 'var(--navy-50)'; el.style.borderColor = 'transparent'; }}
                >
                  <span className={`carrier-badge ${job.carrier?.toLowerCase()}`} style={{ flexShrink: 0 }}>{job.carrier}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-800)' }}>{job.userBilling?.labelCount ?? '?'} labels</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--navy-500)' }}>{job.assignedVendor?.name ?? 'Unassigned'}</div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                    background: `${MANIFEST_STATUS_COLOR[job.status] || '#94a3b8'}18`,
                    color: MANIFEST_STATUS_COLOR[job.status] || '#64748b',
                  }}>
                    {MANIFEST_STATUS_LABEL[job.status] || job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Available Label Vendors */}
      <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
        <SectionHeader
          title="Available Label Vendors"
          accent="#0ea5e9"
          action={
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/single')}>
              Create Label →
            </button>
          }
        />
        {vendorAccess.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--navy-500)', fontSize: '0.84rem' }}>
            No vendors are currently enabled for your account.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedCarriers.map((carrier) => (
              <div key={carrier} style={{ border: '1px solid var(--navy-100)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '0.55rem 0.8rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-25)' }}>
                  <span className={`carrier-badge ${carrier.toLowerCase()}`}>{carrier}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {accessByCarrier[carrier].map((vendor, idx) => (
                    <div
                      key={vendor.vendorId}
                      style={{
                        padding: '0.7rem 0.8rem',
                        borderTop: idx === 0 ? 'none' : '1px solid var(--navy-50)',
                        display: 'grid',
                        gap: '0.75rem',
                        alignItems: 'start',
                      }}
                      className="vendor-rate-grid"
                    >
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)' }}>
                          {vendor.vendorName}
                          {vendor.vendorType === 'manifest' && (
                            <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--warning-600)', background: 'var(--warning-50)', border: '1px solid var(--warning-100)', borderRadius: 999, padding: '1px 6px' }}>
                              Manifest
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--navy-600)', marginTop: 2 }}>
                          {vendor.shippingService || 'Standard service'}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--navy-700)', lineHeight: 1.55 }}>
                        {vendor.rateTiers?.length ? (
                          vendor.rateTiers
                            .slice()
                            .sort((a, b) => a.minLbs - b.minLbs)
                            .map((tier, tierIdx) => (
                              <div key={`${vendor.vendorId}-${tierIdx}`}>
                                {tier.minLbs}-{tier.maxLbs === null ? '∞' : tier.maxLbs} lbs: <strong>${tier.rate.toFixed(2)}</strong>
                              </div>
                            ))
                        ) : (
                          <div>
                            All weights: <strong>${vendor.baseRate.toFixed(2)}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Labels */}
      <div className="sh-card">
        <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 3, height: 16, borderRadius: 3, background: '#0ea5e9' }} />
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>Recent Labels</h3>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/history')}>
            View all →
          </button>
        </div>
        {recentLabels.length === 0 ? (
          <div className="empty-state">
            <TagIcon style={{ width: 36, height: 36 }} />
            <h3>No labels yet</h3>
            <p>Generate your first label to see it here.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead><tr><th>Carrier</th><th>Tracking</th><th>Type</th><th>Cost</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {recentLabels.map((lbl: any) => (
                  <tr key={lbl._id}>
                    <td><span className={`carrier-badge ${lbl.carrier?.toLowerCase()}`}>{lbl.carrier || '—'}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--navy-600)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lbl.trackingId || '—'}
                    </td>
                    <td><span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{lbl.isBulk ? 'Bulk' : 'Single'}</span></td>
                    <td style={{ fontWeight: 600, color: lbl.price > 0 ? '#dc2626' : 'var(--navy-500)' }}>{lbl.price > 0 ? fmt$(lbl.price) : '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>{new Date(lbl.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                        background: lbl.status === 'generated' ? 'var(--success-50)' : 'var(--danger-50)',
                        color:      lbl.status === 'generated' ? 'var(--success-700)' : 'var(--danger-600)',
                      }}>{lbl.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <DashboardFAQ />

      {/* Quick Actions */}
      <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
        <SectionHeader title="Quick Actions" accent="var(--accent-500)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <QuickAction label="Single Label"  sub="Generate one label now"    Icon={TagIcon}                   color="#0ea5e9" onClick={() => navigate('/labels/single')} />
          <QuickAction label="Bulk Labels"   sub="Upload CSV, generate many" Icon={ClipboardDocumentListIcon} color="#6366f1" onClick={() => navigate('/labels/bulk')} />
          <QuickAction label="Label History" sub="View all generated labels" Icon={ClockIcon}                 color="#f59e0b" onClick={() => navigate('/labels/history')} />
        </div>
      </div>

      {/* Add Balance Modal */}
      <AddBalanceModal open={showAddBalance} onClose={() => setShowAddBalance(false)} />

      {/* Loss Adjustment Modal */}
      <LossAdjustModal
        open={showLossModal}
        onClose={() => setShowLossModal(false)}
        exceptionCount={exceptionCount}
        savingsTotal={rawSavings}
        onApply={setLossPerItem}
      />
    </div>
  );
};

// ── Reseller Dashboard ────────────────────────────────────────────────────────
const ResellerDashboard: React.FC<{ firstName: string }> = ({ firstName }) => {
  const navigate = useNavigate();
  const [stats, setStats]           = useState<ResellerStats | null>(null);
  const [vendorAccess, setVendorAccess] = useState<VendorAccessItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showAddBalance, setShowAddBalance] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statsRes, accessRes] = await Promise.all([
        axios.get('/stats'),
        axios.get('/access/me').catch(() => ({ data: { access: [] } })),
      ]);
      setStats(statsRes.data);
      setVendorAccess((accessRes.data?.access || []).filter((v: VendorAccessItem) => v.isAllowed));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>;
  if (!stats)  return null;

  const { myBalance, labels, manifests, recentClients, clientCount, activeClients, totalClientSpend } = stats;
  const totalLabels = labels.total || 1;
  const now = new Date();
  const greeting  = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const accessByCarrier = vendorAccess.reduce((acc, item) => {
    if (!acc[item.carrier]) acc[item.carrier] = [];
    acc[item.carrier].push(item);
    return acc;
  }, {} as Record<string, VendorAccessItem[]>);
  const carrierOrder = ['USPS', 'UPS', 'FedEx', 'DHL'];
  const sortedCarriers = Object.keys(accessByCarrier).sort((a, b) => {
    const ai = carrierOrder.indexOf(a);
    const bi = carrierOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Hero */}
      <HeroBanner
        greeting={greeting} name={firstName} dateLabel={dateLabel}
        balanceLabel="My Balance" balance={fmt$(myBalance.currentBalance)}
        onCta={() => setShowAddBalance(true)}
      />

      {/* KPI Grid */}
      <div className="dashboard-kpi-grid" style={{ display: 'grid', gap: '0.875rem' }}>
        <MetricCard label="My Balance"    value={fmt$(myBalance.currentBalance)} sub={`${fmt$(myBalance.totalDeposited)} deposited`} color="#22c55e" Icon={CurrencyDollarIcon} onClick={() => navigate('/profile')} />
        <MetricCard label="Total Clients" value={clientCount}                    sub={`${activeClients} active`}                    color="#6366f1" Icon={UserGroupIcon}       onClick={() => navigate('/reseller/clients')} />
        <MetricCard label="Client Labels" value={labels.total}                   sub="Generated by clients"                         color="#0ea5e9" Icon={TagIcon} />
        <MetricCard label="Client Spend"  value={fmt$(totalClientSpend)}         sub="Labels + manifest jobs"                       color="#f59e0b" Icon={CurrencyDollarIcon} />
      </div>

      {/* Mid row */}
      <div className="dashboard-two-col-grid" style={{ display: 'grid', gap: '1rem' }}>

        {/* My Balance */}
        <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
          <SectionHeader title="My Balance" accent="#22c55e" />
          {[
            { label: 'Available Balance', val: fmt$(myBalance.currentBalance), color: '#22c55e' },
            { label: 'Total Deposited',   val: fmt$(myBalance.totalDeposited), color: '#6366f1' },
            { label: 'Total Spent',       val: fmt$(myBalance.totalSpent),     color: '#ef4444' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.65rem 0', borderBottom: '1px solid var(--navy-50)',
            }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--navy-500)' }}>{label}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Client Activity */}
        <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
          <SectionHeader title="Client Activity" accent="#6366f1" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {['USPS','UPS','FedEx','DHL'].map(c => {
              const count = labels.byCarrier?.[c] || 0;
              const pct   = Math.round((count / totalLabels) * 100);
              return (
                <div key={c}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-600)' }}>{c}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy-500)' }}>{count} · {pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: CARRIER_GRADIENT[c] || CARRIER_COLORS[c], borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid var(--navy-100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Active Jobs',      val: manifests.active,        color: '#f59e0b' },
              { label: 'Completed Jobs',   val: manifests.completed,     color: '#22c55e' },
              { label: 'Total Manifests',  val: manifests.total,         color: 'var(--navy-700)' },
              { label: 'Manifest Revenue', val: fmt$(manifests.revenue), color: '#6366f1' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Available Label Vendors */}
      <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
        <SectionHeader
          title="Available Label Vendors"
          accent="#0ea5e9"
          action={
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/single')}>
              Create Label →
            </button>
          }
        />
        {vendorAccess.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--navy-500)', fontSize: '0.84rem' }}>
            No vendors are currently enabled for your account.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedCarriers.map((carrier) => (
              <div key={carrier} style={{ border: '1px solid var(--navy-100)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '0.55rem 0.8rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-25)' }}>
                  <span className={`carrier-badge ${carrier.toLowerCase()}`}>{carrier}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {accessByCarrier[carrier].map((vendor, idx) => (
                    <div
                      key={vendor.vendorId}
                      style={{
                        padding: '0.7rem 0.8rem',
                        borderTop: idx === 0 ? 'none' : '1px solid var(--navy-50)',
                        display: 'grid',
                        gap: '0.75rem',
                        alignItems: 'start',
                      }}
                      className="vendor-rate-grid"
                    >
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)' }}>
                          {vendor.vendorName}
                          {vendor.vendorType === 'manifest' && (
                            <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--warning-600)', background: 'var(--warning-50)', border: '1px solid var(--warning-100)', borderRadius: 999, padding: '1px 6px' }}>
                              Manifest
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--navy-600)', marginTop: 2 }}>
                          {vendor.shippingService || 'Standard service'}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--navy-700)', lineHeight: 1.55 }}>
                        {vendor.rateTiers?.length ? (
                          vendor.rateTiers
                            .slice()
                            .sort((a, b) => a.minLbs - b.minLbs)
                            .map((tier, tierIdx) => (
                              <div key={`${vendor.vendorId}-${tierIdx}`}>
                                {tier.minLbs}-{tier.maxLbs === null ? '∞' : tier.maxLbs} lbs: <strong>${tier.rate.toFixed(2)}</strong>
                              </div>
                            ))
                        ) : (
                          <div>
                            All weights: <strong>${vendor.baseRate.toFixed(2)}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Clients */}
      <div className="sh-card">
        <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 3, height: 16, borderRadius: 3, background: '#6366f1' }} />
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>My Clients</h3>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/reseller/clients')}>
            Manage clients →
          </button>
        </div>
        {recentClients.length === 0 ? (
          <div className="empty-state">
            <UserGroupIcon style={{ width: 36, height: 36 }} />
            <h3>No clients yet</h3>
            <p>Add your first client from the Clients page.</p>
          </div>
        ) : (
          <div>
            {recentClients.map((c: any) => (
              <div
                key={c._id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--navy-50)', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--navy-50)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <div className="avatar avatar-sm avatar-indigo" style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                  {c.firstName?.charAt(0)}{c.lastName?.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.firstName} {c.lastName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</div>
                </div>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.isActive ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
                <button onClick={() => navigate('/reseller/clients')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-500)', padding: 4 }}>
                  <ArrowUpRightIcon style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <DashboardFAQ />

      {/* Quick Actions */}
      <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
        <SectionHeader title="Quick Actions" accent="var(--accent-500)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <QuickAction label="Manage Clients" sub="Add or manage your clients"  Icon={UserGroupIcon}              color="#6366f1" onClick={() => navigate('/reseller/clients')} />
          <QuickAction label="Single Label"   sub="Generate a label for client" Icon={TagIcon}                   color="#0ea5e9" onClick={() => navigate('/labels/single')} />
          <QuickAction label="Bulk Labels"    sub="Upload CSV for many labels"  Icon={ClipboardDocumentListIcon} color="#f59e0b" onClick={() => navigate('/labels/bulk')} />
        </div>
      </div>

      {/* Add Balance Modal */}
      <AddBalanceModal open={showAddBalance} onClose={() => setShowAddBalance(false)} />
    </div>
  );
};

// ── Dashboard (role router) ────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'reseller') return <ResellerDashboard firstName={user.firstName ?? ''} />;
  return <UserDashboard firstName={user.firstName ?? ''} />;
};

export default Dashboard;
