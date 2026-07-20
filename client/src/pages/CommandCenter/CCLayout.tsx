import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Squares2X2Icon, TagIcon, DocumentDuplicateIcon,
  SparklesIcon, ChartBarIcon,
  ArrowLeftOnRectangleIcon, Bars3Icon, XMarkIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const NAV = [
  { to: '/command-center/dashboard',   icon: Squares2X2Icon,        label: 'Dashboard'          },
  { to: '/command-center/labels',      icon: TagIcon,               label: 'All Labels'          },
  { to: '/command-center/bulk-labels', icon: DocumentDuplicateIcon, label: 'Bulk Batches'        },
  { to: '/command-center/ai-status',   icon: SparklesIcon,          label: 'AI Status Update'    },
  { to: '/command-center/vendor-perf', icon: ChartBarIcon,          label: 'Vendor Performance'  },
];

export default function CCLayout() {
  const navigate    = useNavigate();
  const { user }    = useAuth();
  const [col, setCol] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);
  const exitTo = user?.role === 'admin' ? '/admin/users' : '/dashboard';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)', fontFamily: FONT }}>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={`cc-sidebar${mobileOpen ? ' cc-mobile-open' : ''}`} style={{
        width: col ? 60 : 220,
        background: 'linear-gradient(180deg,#0f172a 0%,#1e1b4b 100%)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.22s ease',
        flexShrink: 0, position: 'sticky', top: 0,
        height: '100vh', overflowY: 'auto', overflowX: 'hidden',
      }}>

        {/* Brand */}
        <div style={{
          padding: col ? '18px 0' : '18px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center',
          justifyContent: col ? 'center' : 'space-between', gap: 8, minWidth: 0,
        }}>
          {!col && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.57rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
                Tracking
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                Command Center
              </div>
            </div>
          )}
          <button
            onClick={() => setCol(c => !c)}
            className="cc-collapse-btn"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'flex', flexShrink: 0 }}
          >
            {col
              ? <Bars3Icon style={{ width: 17, height: 17 }} />
              : <XMarkIcon style={{ width: 17, height: 17 }} />}
          </button>
          <button
            onClick={closeMobile}
            className="cc-mobile-close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'none', flexShrink: 0 }}
          >
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={col ? label : undefined}
              onClick={closeMobile}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 9,
                padding: col ? '10px 0' : '8px 11px',
                borderRadius: 8, textDecoration: 'none',
                justifyContent: col ? 'center' : 'flex-start',
                background: isActive ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: isActive ? '#a5b4fc' : '#64748b',
                fontWeight: isActive ? 600 : 400, fontSize: '0.82rem',
                transition: 'background 0.14s, color 0.14s',
                whiteSpace: 'nowrap', overflow: 'hidden',
              })}
            >
              <Icon style={{ width: 17, height: 17, flexShrink: 0 }} />
              {!col && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Live pulse */}
        {!col && (
          <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 500 }}>Live · All Users</span>
          </div>
        )}

        {/* Exit */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => { closeMobile(); navigate(exitTo); }}
            title="Exit Command Center"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              width: '100%', padding: col ? '9px 0' : '8px 11px',
              borderRadius: 8, background: 'none', border: 'none',
              color: '#475569', fontSize: '0.82rem', cursor: 'pointer',
              justifyContent: col ? 'center' : 'flex-start',
            }}
          >
            <ArrowLeftOnRectangleIcon style={{ width: 17, height: 17, flexShrink: 0 }} />
            {!col && <span>Exit Command Center</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', minHeight: '100vh', minWidth: 0 }}>
        {/* Mobile topbar — hidden on desktop */}
        <div className="cc-mobile-topbar" style={{
          display: 'none', alignItems: 'center', gap: 10,
          padding: '12px 16px', background: '#0f172a',
          position: 'sticky', top: 0, zIndex: 40,
        }}>
          <button
            onClick={() => setMobileOpen(true)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}
          >
            <Bars3Icon style={{ width: 22, height: 22 }} />
          </button>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.9rem', fontFamily: FONT }}>Command Center</span>
        </div>
        <Outlet />
      </main>

      <style>{`
        @media (max-width: 768px) {
          .cc-sidebar {
            position: fixed !important;
            left: 0; top: 0; bottom: 0;
            width: 240px !important;
            transform: translateX(-100%);
            transition: transform 0.22s ease;
            z-index: 1000;
          }
          .cc-sidebar.cc-mobile-open {
            transform: translateX(0);
            box-shadow: 4px 0 32px rgba(0,0,0,0.35);
          }
          .cc-collapse-btn { display: none !important; }
          .cc-mobile-close { display: flex !important; }
          .cc-mobile-topbar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
