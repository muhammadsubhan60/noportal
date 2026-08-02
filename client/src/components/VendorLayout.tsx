import React from 'react';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useVendorAuth } from '../contexts/VendorAuthContext';
import BrandMonogram from './BrandMonogram';
import {
  QueueListIcon,
  CurrencyDollarIcon,
  ArrowLeftOnRectangleIcon,
} from '@heroicons/react/24/outline';

const VendorLayout: React.FC = () => {
  const { vendor, loading, logout } = useVendorAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Wait for localStorage hydration before deciding auth state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!vendor) return <Navigate to="/vendor-portal/login" replace />;

  const nav = [
    { name: 'My Jobs',   href: '/vendor-portal/jobs',     icon: QueueListIcon,       active: location.pathname.startsWith('/vendor-portal/jobs') },
    { name: 'Earnings',  href: '/vendor-portal/earnings', icon: CurrencyDollarIcon,  active: location.pathname === '/vendor-portal/earnings' },
  ];

  const handleLogout = () => { logout(); navigate('/vendor-portal/login'); };

  return (
    <div className="vendor-shell" style={{ display: 'flex', minHeight: '100vh', background: '#0f172a' }}>

      {/* Sidebar — neutral branding (no Label Flow name) */}
      <aside className="vendor-sidebar" style={{
        width: 220, background: '#0f172a', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: '#fff',
              border: '1px solid rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BrandMonogram size={17} color="#111" strokeWidth={2.1} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2 }}>Label Flow</div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Vendor Access</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="vendor-nav" style={{ flex: 1, padding: '8px 0' }}>
          {nav.map(item => (
            <Link key={item.name} to={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '9px 20px',
              fontSize: '0.85rem', fontWeight: 500, textDecoration: 'none',
              color:      item.active ? '#fff'                  : 'rgba(255,255,255,0.55)',
              background: item.active ? 'rgba(99,102,241,0.15)' : 'transparent',
              borderLeft: `3px solid ${item.active ? '#6366f1' : 'transparent'}`,
              transition: 'all 150ms',
            }}>
              <item.icon style={{ width: 17, height: 17, flexShrink: 0 }} />
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="vendor-footer" style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, color: '#fff',
            }}>
              {vendor?.name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {vendor?.name}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>
                {vendor?.carriers?.join(', ')}
              </div>
            </div>
            <button onClick={handleLogout} title="Sign out" style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.3)', padding: 4,
            }}>
              <ArrowLeftOnRectangleIcon style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="vendor-main" style={{ marginLeft: 220, flex: 1, background: '#f1f5f9', minHeight: '100vh', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
};

export default VendorLayout;
