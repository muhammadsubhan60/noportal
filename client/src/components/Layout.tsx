import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import {
  HomeIcon,
  UserGroupIcon,
  UserIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  TagIcon,
  ClipboardDocumentListIcon,
  RectangleStackIcon,
  BuildingStorefrontIcon,
  CubeIcon,
  Squares2X2Icon,
  SignalIcon,
  BanknotesIcon,
  BookOpenIcon,
  PresentationChartLineIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  BellIcon,
  MegaphoneIcon,
  Cog6ToothIcon,
  MapIcon,
  TrophyIcon,
  SparklesIcon,
  LightBulbIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  UsersIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

// ── Announcement types ────────────────────────────────────────────────────────
interface Announcement {
  _id: string;
  title: string;
  content: string;
  category: 'general' | 'service' | 'pricing' | 'maintenance';
  isPinned: boolean;
  createdAt: string;
}

const CAT_STYLE: Record<string, { bar: string; bg: string; text: string; badge: string; badgeText: string }> = {
  general:     { bar: '#3B82F6', bg: '#EFF6FF', text: '#1E40AF', badge: '#DBEAFE', badgeText: '#1D4ED8' },
  service:     { bar: '#22C55E', bg: '#F0FDF4', text: '#166534', badge: '#BBF7D0', badgeText: '#16A34A' },
  pricing:     { bar: '#F59E0B', bg: '#FFFBEB', text: '#92400E', badge: '#FDE68A', badgeText: '#D97706' },
  maintenance: { bar: '#EF4444', bg: '#FEF2F2', text: '#991B1B', badge: '#FECACA', badgeText: '#DC2626' },
};

const CAT_LABEL: Record<string, string> = {
  general: 'General', service: 'Service', pricing: 'Pricing', maintenance: 'Maintenance',
};

const DISMISSED_KEY = 'sh_dismissed_announcements';
const LAST_SEEN_KEY = 'sh_announcements_last_seen';
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

// <img src> requests go straight to the API origin, not through axios, so a
// server-relative path like "/api/branding/logo/x.png" needs the origin prefixed.
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');
const toAbsoluteUrl = (p: string) => (p.startsWith('http') ? p : `${API_ORIGIN}${p}`);

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  current: boolean;
  badge?: number;
}

interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

const COLLAPSED_KEY = 'sh_sidebar_collapsed';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [collapsed, setCollapsed]       = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overview: true, labels: true, operations: true, finance: true, management: true,
  });
  const [tooltip, setTooltip] = useState<{ name: string; y: number } | null>(null);
  const tooltipTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipShowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminDefaultsApplied = useRef(false);

  // ── Announcement state ─────────────────────────────────────────────────────
  const [announcements,  setAnnouncements]  = useState<Announcement[]>([]);
  const [alertVisible,   setAlertVisible]   = useState(false);
  const [alertIdx,       setAlertIdx]       = useState(0);   // which undismissed item to show
  const [bellOpen,       setBellOpen]       = useState(false);
  const [unreadCount,    setUnreadCount]    = useState(0);
  const bellRef    = useRef<HTMLDivElement>(null);
  const bellBtnRef = useRef<HTMLButtonElement>(null);

  const { user, logout } = useAuth();
  const location         = useLocation();
  const navigate         = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [navCounts, setNavCounts] = useState<{ users?: number; manifestsUnderReview?: number; labelsToday?: number; clientCount?: number }>({});
  const [branding, setBranding] = useState<{ orgName: string; logoUrl: string | null }>({ orgName: '', logoUrl: null });
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [brandForm, setBrandForm] = useState<{ orgName: string; logoFile: File | null; logoPreview: string | null }>({ orgName: '', logoFile: null, logoPreview: null });
  const [savingBrand, setSavingBrand]     = useState(false);
  const [removingBrandLogo, setRemovingBrandLogo] = useState(false);
  const [brandError, setBrandError]       = useState('');
  const hasBranding = !!(branding.orgName || branding.logoUrl);

  // Fetch this user's own branding (name + logo shown in their sidebar)
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    axios.get(`${API_BASE}/branding`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setBranding({ orgName: res.data?.orgName || '', logoUrl: res.data?.logoUrl || null }))
      .catch(() => {});
  }, [user]);

  const openBrandModal = () => {
    setBrandForm({ orgName: branding.orgName, logoFile: null, logoPreview: null });
    setBrandError('');
    setBrandModalOpen(true);
  };
  const closeBrandModal = () => setBrandModalOpen(false);

  const handleBrandLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setBrandForm(f => ({ ...f, logoFile: file, logoPreview: file ? URL.createObjectURL(file) : f.logoPreview }));
  };

  const handleSaveBrand = async () => {
    setSavingBrand(true);
    setBrandError('');
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('orgName', brandForm.orgName.trim());
      if (brandForm.logoFile) fd.append('logo', brandForm.logoFile);
      const res = await axios.put(`${API_BASE}/branding`, fd, { headers: { Authorization: `Bearer ${token}` } });
      setBranding({ orgName: res.data?.orgName || '', logoUrl: res.data?.logoUrl || null });
      setBrandModalOpen(false);
    } catch (err: any) {
      setBrandError(err.response?.data?.message || 'Failed to save branding.');
    } finally {
      setSavingBrand(false);
    }
  };

  const handleRemoveBrandLogo = async () => {
    setRemovingBrandLogo(true);
    setBrandError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`${API_BASE}/branding/logo`, { headers: { Authorization: `Bearer ${token}` } });
      setBranding({ orgName: res.data?.orgName || '', logoUrl: res.data?.logoUrl || null });
      setBrandForm(f => ({ ...f, logoFile: null, logoPreview: null }));
    } catch (err: any) {
      setBrandError(err.response?.data?.message || 'Failed to remove logo.');
    } finally {
      setRemovingBrandLogo(false);
    }
  };

  // Fetch balance
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    axios.get(`${API_BASE}/balance`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setBalance(res.data?.balance?.currentBalance ?? 0))
      .catch(() => {});
  }, [user]);

  // Admins rarely use their own label tools day-to-day — start that section
  // collapsed so the sidebar opens on admin-relevant sections instead.
  // Runs once, so it never fights a manual toggle afterward.
  useEffect(() => {
    if (!user || adminDefaultsApplied.current) return;
    adminDefaultsApplied.current = true;
    if (user.role === 'admin') {
      setOpenSections(prev => ({ ...prev, labels: false }));
    }
  }, [user]);

  // Fetch nav badge counts (admin/reseller only) — reuses the existing role-aware
  // /api/stats endpoint rather than a bespoke counts endpoint.
  useEffect(() => {
    if (!user || user.role === 'user') return;
    const token = localStorage.getItem('token');
    axios.get(`${API_BASE}/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const d = res.data;
        if (user.role === 'admin') {
          setNavCounts({ users: d.users?.total, manifestsUnderReview: d.manifests?.underReview, labelsToday: d.labels?.today });
        } else if (user.role === 'reseller') {
          setNavCounts({ clientCount: d.clientCount });
        }
      })
      .catch(() => {});
  }, [user]);

  // Persist collapse state + sync CSS variables
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '72px' : '256px');
  }, [collapsed]);

  // Auto-expand sidebar on mobile breakpoint
  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 768) setCollapsed(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Fetch announcements ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    axios.get(`${API_BASE}/announcements`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const list: Announcement[] = res.data.announcements || [];
        setAnnouncements(list);

        // Alert bar: find first undismissed
        const d: string[] = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
        const undismissed = list.filter(a => !d.includes(a._id));
        if (undismissed.length > 0) { setAlertVisible(true); setAlertIdx(0); }

        // Bell badge: count items created after last-seen timestamp
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
        const newCount = lastSeen
          ? list.filter(a => new Date(a.createdAt) > new Date(lastSeen)).length
          : list.length;
        setUnreadCount(newCount);
      })
      .catch(() => {});
  }, [user]);

  // Close bell dropdown when clicking outside (both dropdown and trigger button)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        bellRef.current    && !bellRef.current.contains(e.target as Node) &&
        bellBtnRef.current && !bellBtnRef.current.contains(e.target as Node)
      ) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Announcement helpers (derived, declared before any effect that uses them)
  const getDismissed = (): string[] => JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  const undismissedAnnouncements = announcements.filter(a => !getDismissed().includes(a._id));
  const currentAlert = undismissedAnnouncements[alertIdx] ?? null;

  // Sync alert bar height CSS variable (currentAlert is now declared above)
  useEffect(() => {
    document.documentElement.style.setProperty('--alert-h', alertVisible && currentAlert ? '42px' : '0px');
  }, [alertVisible, currentAlert]);

  const dismissAlert = () => {
    if (!currentAlert) return;
    const d = getDismissed();
    d.push(currentAlert._id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(d));
    const next = undismissedAnnouncements.filter(a => !d.includes(a._id));
    if (next.length > 0) { setAlertIdx(0); }
    else { setAlertVisible(false); }
    // trigger re-render
    setAnnouncements(prev => [...prev]);
  };

  const openBell = () => {
    setBellOpen(v => !v);
    // Mark as seen
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setUnreadCount(0);
  };

  // ── Navigation definitions ──────────────────────────────────────────────
  // Admin lands on "Admin Panel" + "Live Monitor" instead of the vanity
  // Dashboard/Live Activity views — /dashboard already redirects admins to
  // /admin, so surfacing "Dashboard" for them would be a dead click.
  const overviewNav: NavItem[] = user?.role === 'admin' ? [
    { name: 'Admin Panel',    href: '/admin',            icon: Squares2X2Icon,  current: location.pathname === '/admin' },
    { name: 'Live Monitor',   href: '/admin/live',       icon: SignalIcon,      current: location.pathname === '/admin/live', badge: navCounts.labelsToday },
    { name: 'Command Center', href: '/command-center',   icon: CommandLineIcon, current: location.pathname.startsWith('/command-center') },
    { name: 'Announcements',  href: '/announcements',    icon: MegaphoneIcon,   current: location.pathname === '/announcements' },
    { name: 'Suggestions',    href: '/suggestions',      icon: LightBulbIcon,   current: location.pathname === '/suggestions' },
  ] : user?.role === 'reseller' ? [
    { name: 'Dashboard',     href: '/dashboard',     icon: HomeIcon,      current: location.pathname === '/dashboard' },
    { name: 'Announcements', href: '/announcements', icon: MegaphoneIcon, current: location.pathname === '/announcements' },
    { name: 'Live Activity', href: '/activity',      icon: SignalIcon,    current: location.pathname === '/activity' },
    { name: 'Leaderboard',   href: '/leaderboard',   icon: TrophyIcon,    current: location.pathname === '/leaderboard' },
    { name: 'Suggestions',   href: '/suggestions',   icon: LightBulbIcon, current: location.pathname === '/suggestions' },
  ] : [
    // Live Activity removed for plain users for now
    { name: 'Dashboard',     href: '/dashboard',     icon: HomeIcon,      current: location.pathname === '/dashboard' },
    { name: 'Announcements', href: '/announcements', icon: MegaphoneIcon, current: location.pathname === '/announcements' },
    { name: 'Leaderboard',   href: '/leaderboard',   icon: TrophyIcon,    current: location.pathname === '/leaderboard' },
    { name: 'Suggestions',   href: '/suggestions',   icon: LightBulbIcon, current: location.pathname === '/suggestions' },
  ];

  const labelsNav: NavItem[] = [
    { name: 'Single Label',     href: '/labels/single',       icon: TagIcon,                   current: location.pathname === '/labels/single' },
    { name: 'Bulk Labels',      href: '/labels/bulk',          icon: RectangleStackIcon,        current: location.pathname === '/labels/bulk' },
    { name: 'Single History',   href: '/labels/history',      icon: ClipboardDocumentListIcon, current: location.pathname === '/labels/history' },
    { name: 'Bulk History',     href: '/labels/bulk-history', icon: ClipboardDocumentListIcon, current: location.pathname === '/labels/bulk-history' },
    { name: 'Manifest History', href: '/manifest/history',    icon: Squares2X2Icon,            current: location.pathname === '/manifest/history' },
  ];

  // Command Center — its own section only for a reseller with delegate access;
  // for admin it lives inside Overview (see above) instead of a lone-item section.
  const ccItems: NavItem[] = (user?.role === 'reseller' && user?.ccAccess) ? [
    { name: 'Command Center', href: '/command-center', icon: CommandLineIcon, current: location.pathname.startsWith('/command-center') },
  ] : [];

  // Admin — Operations (Live Monitor now lives in Overview, see above)
  const adminOpsItems: NavItem[] = user?.role === 'admin' ? [
    { name: 'Manifest Ops', href: '/admin/manifest', icon: Squares2X2Icon, current: location.pathname === '/admin/manifest', badge: navCounts.manifestsUnderReview },
    { name: 'Warehouses',   href: '/admin/warehouses', icon: CubeIcon, current: location.pathname === '/admin/warehouses' },
    { name: 'State Analytics',   href: '/admin/states',                icon: MapIcon,       current: location.pathname === '/admin/states' },
    { name: 'AI Bulk Tracking', href: '/admin/bulk-tracking-update', icon: SparklesIcon,  current: location.pathname === '/admin/bulk-tracking-update' },
    { name: 'Logs & Errors', href: '/admin/logs', icon: ExclamationTriangleIcon, current: location.pathname === '/admin/logs' },
  ] : [];

  // Admin — Finance
  const adminFinanceItems: NavItem[] = user?.role === 'admin' ? [
    { name: 'Finance',           href: '/admin/finance',             icon: BanknotesIcon,             current: location.pathname === '/admin/finance' },
    { name: 'Cash Book',         href: '/admin/cashbook',            icon: BookOpenIcon,              current: location.pathname === '/admin/cashbook' },
    { name: 'Fin. Dashboard',    href: '/admin/financial-dashboard', icon: PresentationChartLineIcon, current: location.pathname === '/admin/financial-dashboard' },
  ] : [];

  // Admin — Management | Reseller — Clients
  // ("Admin Panel" now lives in Overview, see overviewNav above)
  const mgmtItems: NavItem[] = user?.role === 'admin' ? [
    { name: 'Users',       href: '/admin/users',        icon: UserGroupIcon,          current: location.pathname.startsWith('/admin/users'), badge: navCounts.users },
    { name: 'Vendors',     href: '/admin/vendors',      icon: BuildingStorefrontIcon, current: location.pathname === '/admin/vendors' },
    { name: 'Bulk Vendor Access', href: '/admin/bulk-vendor-access', icon: UsersIcon, current: location.pathname === '/admin/bulk-vendor-access' },
    { name: 'User Stats',  href: '/admin/user-stats',   icon: PresentationChartLineIcon, current: location.pathname === '/admin/user-stats' },
    { name: 'Settings',    href: '/admin/settings',     icon: Cog6ToothIcon,          current: location.pathname === '/admin/settings' },
  ] : user?.role === 'reseller' ? [
    { name: 'My Clients', href: '/reseller/clients',    icon: UserGroupIcon,             current: location.pathname.startsWith('/reseller/clients'), badge: navCounts.clientCount },
    { name: 'Bulk Access', href: '/reseller/bulk-access', icon: UsersIcon,               current: location.pathname === '/reseller/bulk-access' },
    { name: 'User Stats',  href: '/reseller/user-stats',  icon: PresentationChartLineIcon, current: location.pathname === '/reseller/user-stats' },
    { name: 'Finance',    href: '/reseller/finance',    icon: BanknotesIcon,             current: location.pathname === '/reseller/finance' },
  ] : [];

  const sections: NavSection[] = [
    { key: 'overview',    label: 'Overview',    items: overviewNav },
    { key: 'labels',      label: 'Labels',      items: labelsNav },
    ...(ccItems.length > 0           ? [{ key: 'cc',         label: 'Command Center', items: ccItems }]          : []),
    ...(adminOpsItems.length > 0     ? [{ key: 'operations', label: 'Operations',  items: adminOpsItems }]     : []),
    ...(adminFinanceItems.length > 0 ? [{ key: 'finance',    label: 'Finance',     items: adminFinanceItems }] : []),
    ...(mgmtItems.length > 0         ? [{ key: 'management', label: user?.role === 'reseller' ? 'Clients' : 'Management', items: mgmtItems }] : []),
  ];

  const initials  = `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`;

  const roleChip = user?.role === 'admin'
    ? { bg: 'rgba(239,68,68,0.18)',    color: '#FCA5A5',  label: 'Admin'    }
    : user?.role === 'reseller'
    ? { bg: 'rgba(245,158,11,0.18)',   color: '#FCD34D',  label: 'Reseller' }
    : { bg: 'rgba(59,130,246,0.18)',   color: '#93C5FD',  label: 'User'     };

  const toggleSection = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const handleLogout = () => { logout(); navigate('/login'); };

  // ── NavLink ──────────────────────────────────────────────────────────────
  const NavLink = ({ item }: { item: NavItem }) => {
    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLElement>) => {
      if (!collapsed) return;
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
      if (tooltipShowTimer.current) clearTimeout(tooltipShowTimer.current);
      const rect = e.currentTarget.getBoundingClientRect();
      tooltipShowTimer.current = setTimeout(() => {
        setTooltip({ name: item.name, y: rect.top + rect.height / 2 });
      }, 130);
    }, [item.name]);

    const handleMouseLeave = useCallback(() => {
      if (tooltipShowTimer.current) clearTimeout(tooltipShowTimer.current);
      tooltipTimer.current = setTimeout(() => setTooltip(null), 80);
    }, []);

    return (
      <div className="nav-item-wrapper">
        <Link
          to={item.href}
          className={`sidebar-link${item.current ? ' active' : ''}${collapsed ? ' icon-only' : ''}`}
          onClick={() => setSidebarOpen(false)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <item.icon className="nav-icon" />
          {!collapsed && <span className="nav-label">{item.name}</span>}
          {!collapsed && !!item.badge && (
            <span className="nav-badge-pill">{item.badge > 999 ? '999+' : item.badge}</span>
          )}
          {item.current && !collapsed && <span className="nav-active-dot" />}
        </Link>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ── Fixed full-width announcement bar ───────────────── */}
      {alertVisible && currentAlert && (() => {
        const cat = CAT_STYLE[currentAlert.category] ?? CAT_STYLE.general;
        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 1.5rem',
            background: cat.bg,
            borderBottom: `1px solid ${cat.badge}`,
            height: 42,
            animation: 'alertSlideDown 0.22s cubic-bezier(0.4,0,0.2,1) both',
          }}>
            <div style={{ width: 3, height: 22, borderRadius: 99, background: cat.bar, flexShrink: 0 }} />
            <span style={{
              fontSize: '0.63rem', fontWeight: 800, letterSpacing: '0.06em',
              textTransform: 'uppercase', padding: '2px 8px', borderRadius: 99,
              background: cat.badge, color: cat.badgeText, flexShrink: 0,
              border: `1px solid ${cat.badgeText}33`,
            }}>
              {CAT_LABEL[currentAlert.category]}
            </span>
            <span style={{
              flex: 1, fontSize: '0.8rem', fontWeight: 600, color: cat.text,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {currentAlert.title}
            </span>
            <button
              onClick={() => { setAlertVisible(false); navigate('/announcements'); }}
              style={{
                padding: '3px 11px', borderRadius: 7,
                border: `1.5px solid ${cat.badgeText}55`,
                background: 'transparent', color: cat.badgeText,
                fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              View →
            </button>
            <button
              onClick={dismissAlert}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: cat.text, opacity: 0.5, padding: '2px 4px',
                borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center',
                transition: 'opacity 0.12s',
              }}
              title="Dismiss"
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
            >
              <XMarkIcon style={{ width: 15, height: 15 }} />
            </button>
          </div>
        );
      })()}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 39,
            background: 'rgba(15,23,42,0.65)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>

        {/* Logo / brand */}
        <div className={`sidebar-logo${collapsed ? ' sidebar-logo-collapsed' : ''}`}>
          <button
            type="button"
            onClick={openBrandModal}
            title={hasBranding ? 'Edit your branding' : 'Add your branding'}
            style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
              overflow: 'hidden', flex: 1, minWidth: 0,
              background: 'none', border: 'none', padding: 0, margin: 0,
              cursor: 'pointer', textAlign: 'left', font: 'inherit',
            }}
          >
            <div className="sidebar-logo-icon">
              {branding.logoUrl ? (
                <img
                  src={toAbsoluteUrl(branding.logoUrl)}
                  alt=""
                  style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 4 }}
                />
              ) : branding.orgName ? (
                // Name set but no logo yet — show an initial badge, never the
                // platform's own mark (that would look like branding never changed).
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#fff', fontSize: 10, fontWeight: 800,
                }}>
                  {branding.orgName.trim().charAt(0).toUpperCase()}
                </div>
              ) : (
                <SparklesIcon style={{ width: 16, height: 16, color: '#94a3b8' }} />
              )}
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                {hasBranding ? (
                  <>
                    <div className="sidebar-brand-name">{(branding.orgName || 'LABEL FLOW').toUpperCase()}</div>
                    <div className="sidebar-brand-sub">Shipping Portal</div>
                  </>
                ) : (
                  <>
                    <div className="sidebar-brand-name" style={{ color: 'rgba(255,255,255,0.6)' }}>+ Add branding</div>
                    <div className="sidebar-brand-sub">Your name &amp; logo</div>
                  </>
                )}
              </div>
            )}
          </button>

          {/* Collapse toggle — desktop only */}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeftIcon
              style={{
                width: 13, height: 13,
                transition: 'transform var(--transition-base)',
                transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </div>

        {/* Mobile close */}
        <button
          className="sidebar-mobile-close"
          onClick={() => setSidebarOpen(false)}
        >
          <XMarkIcon style={{ width: 18, height: 18 }} />
        </button>

        {/* ── Navigation ──────────────────────────────────────────────── */}
        <nav style={{ flex: 1, paddingTop: 6 }}>
          {sections.map((section, si) => (
            <div key={section.key} className={`sidebar-section${collapsed ? ' sidebar-section-collapsed' : ''}`}>

              {/* Section header (expanded mode) */}
              {!collapsed ? (
                <button
                  className="sidebar-section-btn"
                  onClick={() => toggleSection(section.key)}
                >
                  <span className="sidebar-nav-label">{section.label}</span>
                  <ChevronDownIcon
                    style={{
                      width: 11, height: 11,
                      color: 'rgba(255,255,255,0.25)',
                      flexShrink: 0,
                      transition: 'transform var(--transition-fast)',
                      transform: openSections[section.key] !== false ? 'rotate(0)' : 'rotate(-90deg)',
                    }}
                  />
                </button>
              ) : (
                si > 0 && <div className="sidebar-section-rule" />
              )}

              {/* Section items */}
              <div
                className="sidebar-section-items"
                style={{
                  maxHeight: collapsed || openSections[section.key] !== false ? '600px' : '0px',
                  overflow: 'hidden',
                  transition: 'max-height 0.28s cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {section.items.map(item => (
                  <NavLink key={item.name} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── User footer ─────────────────────────────────────────────── */}
        <div className={`sidebar-footer${collapsed ? ' sidebar-footer-collapsed' : ''}`}>
          {collapsed ? (
            /* Collapsed: stack avatar → balance → action icons */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                className="avatar avatar-sm avatar-indigo"
                title={`${user?.firstName} ${user?.lastName} · ${user?.role} — View profile`}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('/profile')}
              >
                {initials}
              </div>
              <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#4ade80', letterSpacing: '-0.2px' }}>
                {balance === null ? '—' : `$${balance.toFixed(2)}`}
              </div>
              <button ref={bellBtnRef} className="sidebar-footer-btn" onClick={openBell} title="Notifications">
                <BellIcon style={{ width: 14, height: 14 }} />
                {unreadCount > 0 && <span className="bell-badge" />}
              </button>
              <ThemeToggle compact className="sidebar-footer-btn" />
              <button onClick={handleLogout} title="Sign out" className="sidebar-footer-btn logout">
                <ArrowLeftOnRectangleIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ) : (
            /* Expanded: user info row → divider → balance + action row */
            <>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, cursor: 'pointer' }}
                onClick={() => navigate('/profile')}
                title="View profile"
              >
                <div className="avatar avatar-sm avatar-indigo">{initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.firstName} {user?.lastName}
                  </div>
                  <span style={{
                    display: 'inline-block', marginTop: 2,
                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em',
                    textTransform: 'uppercase', padding: '1px 7px', borderRadius: 99,
                    background: roleChip.bg, color: roleChip.color,
                  }}>
                    {roleChip.label}
                  </span>
                </div>
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />

              <div style={{ display: 'flex', alignItems: 'center' }}>
                {/* Balance */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 1 }}>
                    Balance
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#4ade80', letterSpacing: '-0.3px' }}>
                    {balance === null ? '—' : `$${balance.toFixed(2)}`}
                  </div>
                </div>
                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button ref={bellBtnRef} className="sidebar-footer-btn" onClick={openBell} title="Notifications">
                    <BellIcon style={{ width: 15, height: 15 }} />
                    {unreadCount > 0 && <span className="bell-badge" />}
                  </button>
                  <ThemeToggle compact className="sidebar-footer-btn" />
                  <button onClick={handleLogout} title="Sign out" className="sidebar-footer-btn logout">
                    <ArrowLeftOnRectangleIcon style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className={`main-content${collapsed ? ' sidebar-collapsed' : ''}`}>

        {/* Page content */}
        <main className="page-content">
          <div key={location.pathname} className="animate-fadeInUp">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Mobile bottom navigation ─────────────────────────── */}
      <nav className="mobile-bottom-nav">
        {[
          { href: '/dashboard',     icon: HomeIcon,           name: 'Home',    current: location.pathname === '/dashboard' },
          { href: '/labels/single', icon: TagIcon,            name: 'Label',   current: location.pathname === '/labels/single' },
          { href: '/labels/bulk',   icon: RectangleStackIcon, name: 'Bulk',    current: location.pathname === '/labels/bulk' },
          { href: '/profile',       icon: UserIcon,           name: 'Profile', current: location.pathname === '/profile' },
        ].map(item => (
          <Link
            key={item.href}
            to={item.href}
            className={`mobile-nav-item${item.current ? ' active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <item.icon style={{ width: 22, height: 22 }} />
            <span>{item.name}</span>
          </Link>
        ))}
        <button
          className="mobile-nav-item"
          onClick={() => setSidebarOpen(true)}
        >
          <Bars3Icon style={{ width: 22, height: 22 }} />
          <span>More</span>
        </button>
      </nav>

      {/* ── Bell dropdown — fixed to escape sidebar overflow-x:hidden ── */}
      {bellOpen && (
        <div
          ref={bellRef}
          style={{
            position: 'fixed',
            left: 'var(--sidebar-w, 256px)',
            bottom: 8,
            marginLeft: 10,
            width: 340,
            background: 'var(--bg-card)',
            borderRadius: 14,
            border: '1.5px solid var(--navy-200)',
            boxShadow: '0 -6px 32px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
            zIndex: 9100,
            overflow: 'hidden',
            animation: 'fadeInUp 0.18s ease both',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '0.85rem 1.1rem 0.7rem',
            borderBottom: '1px solid var(--navy-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)' }}>Announcements</span>
            <button
              onClick={() => { setBellOpen(false); navigate('/announcements'); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--accent-600)', fontWeight: 600 }}
            >
              View all →
            </button>
          </div>

          {/* Items */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {announcements.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.82rem' }}>
                No announcements yet.
              </div>
            ) : (
              announcements.slice(0, 6).map((a, i) => {
                const cat = CAT_STYLE[a.category] ?? CAT_STYLE.general;
                const isNew = !localStorage.getItem(LAST_SEEN_KEY) ||
                  new Date(a.createdAt) > new Date(localStorage.getItem(LAST_SEEN_KEY)!);
                return (
                  <div
                    key={a._id}
                    onClick={() => { setBellOpen(false); navigate('/announcements'); }}
                    style={{
                      display: 'flex', gap: 10, padding: '0.7rem 1.1rem',
                      borderBottom: i < announcements.slice(0, 6).length - 1 ? '1px solid var(--navy-50)' : 'none',
                      cursor: 'pointer',
                      background: isNew ? `${cat.bg}80` : 'var(--bg-card)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-50)')}
                    onMouseLeave={e => (e.currentTarget.style.background = isNew ? `${cat.bg}80` : 'var(--bg-card)')}
                  >
                    <div style={{ width: 3, borderRadius: 99, background: cat.bar, flexShrink: 0, alignSelf: 'stretch', minHeight: 28 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{
                          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em',
                          textTransform: 'uppercase', padding: '1px 6px', borderRadius: 99,
                          background: cat.badge, color: cat.badgeText,
                        }}>
                          {CAT_LABEL[a.category]}
                        </span>
                        {isNew && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.title}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>
                        {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Fixed tooltip — escapes sidebar overflow clipping */}
      {collapsed && tooltip && (
        <div
          style={{
            position: 'fixed',
            left: 82,
            top: tooltip.y,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            animation: 'tooltipPop 0.12s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
        >
          {/* Arrow */}
          <div style={{
            width: 0, height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderRight: '6px solid #1e293b',
          }} />
          {/* Label */}
          <div style={{
            background: '#1e293b',
            color: '#fff',
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
            border: '1px solid rgba(255,255,255,0.08)',
            letterSpacing: '0.01em',
          }}>
            {tooltip.name}
          </div>
        </div>
      )}

      {/* ── Branding modal ──────────────────────────────────────────── */}
      {brandModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeBrandModal(); }}
        >
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 400,
            boxShadow: '0 24px 64px rgba(0,0,0,0.28)', padding: '1.6rem',
          }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                {hasBranding ? 'Edit Your Branding' : 'Add Your Branding'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', marginTop: 3 }}>
                Your name and logo replace the default mark in your sidebar.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
              <div style={{
                width: 60, height: 60, borderRadius: 12,
                border: '1.5px dashed var(--navy-150, #e2e8f0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', background: 'var(--navy-50, #f8fafc)', flexShrink: 0,
              }}>
                {brandForm.logoPreview || branding.logoUrl ? (
                  <img
                    src={brandForm.logoPreview || toAbsoluteUrl(branding.logoUrl!)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <PhotoIcon style={{ width: 24, height: 24, color: '#94a3b8' }} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                  padding: '6px 12px', borderRadius: 7,
                  border: '1.5px solid var(--navy-150, #e2e8f0)', background: 'transparent',
                  color: 'var(--navy-600, #475569)', fontSize: '0.78rem', fontWeight: 600,
                }}>
                  Upload logo
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.svg,.webp"
                    onChange={handleBrandLogoPick}
                    style={{ display: 'none' }}
                  />
                </label>
                {branding.logoUrl && !brandForm.logoFile && (
                  <button
                    onClick={handleRemoveBrandLogo}
                    disabled={removingBrandLogo}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#DC2626', fontSize: '0.75rem', fontWeight: 600, padding: 0, textAlign: 'left',
                    }}
                  >
                    {removingBrandLogo ? 'Removing…' : 'Remove logo'}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: '0.72rem', fontWeight: 700,
                color: 'var(--navy-500)', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                Organization Name
              </label>
              <input
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1.5px solid var(--navy-150, #e2e8f0)',
                  fontSize: '0.85rem', color: 'var(--navy-800)', outline: 'none', boxSizing: 'border-box',
                }}
                placeholder="e.g. Acme Shipping Co."
                maxLength={60}
                value={brandForm.orgName}
                onChange={e => setBrandForm(f => ({ ...f, orgName: e.target.value }))}
                autoFocus
              />
            </div>

            {brandError && (
              <div style={{
                marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#FFF5F5',
                border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '0.78rem', fontWeight: 600,
              }}>
                {brandError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={closeBrandModal}
                disabled={savingBrand}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1.5px solid var(--navy-150, #e2e8f0)', background: 'transparent',
                  color: 'var(--navy-600, #475569)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBrand}
                disabled={savingBrand}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'var(--accent-600, #4f46e5)', color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                }}
              >
                {savingBrand ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .nav-badge-pill {
          margin-left: 6px;
          font-size: 0.58rem;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 99px;
          background: rgba(99, 102, 241, 0.22);
          color: #a5b4fc;
          border: 1px solid rgba(99, 102, 241, 0.25);
          flex-shrink: 0;
        }
        @keyframes tooltipPop {
          from { opacity: 0; transform: translateY(-50%) scale(0.88) translateX(-6px); }
          to   { opacity: 1; transform: translateY(-50%) scale(1)    translateX(0); }
        }
        @keyframes alertSlideDown {
          from { opacity: 0; max-height: 0; }
          to   { opacity: 1; max-height: 60px; }
        }
        @media (max-width: 768px) {
          .sidebar-collapse-btn   { display: none !important; }
          .sidebar-mobile-close   { display: flex !important; }
        }
        @media (min-width: 769px) {
          .sidebar-mobile-close   { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default Layout;
