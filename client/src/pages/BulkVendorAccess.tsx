import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  MagnifyingGlassIcon, CheckCircleIcon, ExclamationCircleIcon,
  XMarkIcon, ChevronDownIcon, ChevronUpIcon, ArrowLeftIcon,
  ShieldCheckIcon, ShieldExclamationIcon, UsersIcon, TagIcon,
  CurrencyDollarIcon, PlusIcon, TrashIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const CARRIERS_ORDER = ['USPS', 'UPS', 'FedEx', 'DHL'];

const CARRIER_BG: Record<string, { border: string; headerBg: string }> = {
  USPS:  { border: 'rgba(0,75,135,0.22)',  headerBg: 'rgba(0,75,135,0.06)'  },
  UPS:   { border: 'rgba(75,20,0,0.22)',   headerBg: 'rgba(75,20,0,0.07)'   },
  FedEx: { border: 'rgba(77,20,140,0.22)', headerBg: 'rgba(77,20,140,0.06)' },
  DHL:   { border: 'rgba(212,5,17,0.22)',  headerBg: 'rgba(255,204,0,0.15)' },
};

const PORTAL_META: Record<string, { label: string; color: string; bg: string }> = {
  shippershub: { label: 'ShippersHub', color: '#1d4ed8', bg: 'rgba(29,78,216,0.06)'   },
  labelcrow:   { label: 'LabelCrow',   color: '#7c3aed', bg: 'rgba(124,58,237,0.06)'  },
  shiplabel:   { label: 'ShipLabel',   color: '#059669', bg: 'rgba(5,150,105,0.06)'   },
  manifest:    { label: 'Manifest',    color: '#64748b', bg: 'rgba(100,116,139,0.06)' },
};

const ROLE_STYLE: Record<string, { color: string; bg: string; border: string; grad: string }> = {
  reseller: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.25)',  grad: 'linear-gradient(135deg,#6366f1,#4f46e5)' },
  user:     { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)',  grad: 'linear-gradient(135deg,#64748b,#475569)' },
};

interface UserRow {
  id: string; firstName: string; lastName: string;
  email: string; role: string; isActive: boolean;
}
interface VendorItem {
  vendorId: string; vendorName: string; carrier: string;
  vendorType: string; shippingService: string;
  baseRate: number; portal: string;
}

const inp: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem',
  background: 'var(--navy-50)', border: '1.5px solid var(--navy-200)',
  borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.82rem',
  fontFamily: FONT, outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.18s, box-shadow 0.18s',
};

const focusI = (e: React.FocusEvent<HTMLInputElement>) =>
  Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' });
const blurI = (e: React.FocusEvent<HTMLInputElement>) =>
  Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' });

const CarrierBadge: React.FC<{ carrier: string }> = ({ carrier }) => {
  const base: React.CSSProperties = { fontWeight: 900, fontSize: '0.72rem', letterSpacing: '0.07em', padding: '2px 7px', borderRadius: 5, display: 'inline-flex', alignItems: 'center' };
  if (carrier === 'FedEx') return <span style={{ fontWeight: 900, fontSize: '0.82rem' }}><span style={{ color: '#4D148C' }}>Fed</span><span style={{ color: '#FF6600' }}>Ex</span></span>;
  const s: Record<string, React.CSSProperties> = {
    USPS: { background: '#004B87', color: '#fff' },
    UPS:  { background: '#4B1400', color: '#FFB500' },
    DHL:  { background: '#FFCC00', color: '#D40511' },
  };
  return <span style={{ ...base, ...(s[carrier] || { background: '#334155', color: '#fff' }) }}>{carrier}</span>;
};

const BulkVendorAccess: React.FC = () => {
  const { user: authUser } = useAuth();
  const navigate = useNavigate();

  // ── Users ────────────────────────────────────────────────────
  const [users,       setUsers]       = useState<UserRow[]>([]);
  const [loadingU,    setLoadingU]    = useState(true);
  const [userSearch,  setUserSearch]  = useState('');
  const [roleFilter,  setRoleFilter]  = useState<'' | 'user' | 'reseller'>('');
  const [selectedU,   setSelectedU]   = useState<Set<string>>(new Set());
  const [userPage,    setUserPage]    = useState(1);
  const [totalPages,  setTotalPages]  = useState(1);

  // ── Vendors ──────────────────────────────────────────────────
  const [vendors,     setVendors]     = useState<VendorItem[]>([]);
  const [loadingV,    setLoadingV]    = useState(true);
  const [vendorSearch,setVendorSearch]= useState('');
  const [selectedV,   setSelectedV]   = useState<Set<string>>(new Set());
  const [openCarriers,setOpenCarriers]= useState<Record<string, boolean>>({});

  // ── Op ───────────────────────────────────────────────────────
  const [applying,  setApplying]  = useState(false);
  const [message,   setMessage]   = useState('');
  const [error,     setError]     = useState('');

  // ── Rate modal ───────────────────────────────────────────────
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateMode,      setRateMode]      = useState<'replace' | 'skip_existing'>('replace');
  const [flatRate,      setFlatRate]      = useState('');
  const [tiers,         setTiers]         = useState<Array<{ minLbs: string; maxLbs: string; rate: string }>>([{ minLbs: '0', maxLbs: '', rate: '' }]);
  const [applyingRates, setApplyingRates] = useState(false);

  useEffect(() => { fetchUsers(); }, [userPage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchVendors(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (message || error) {
      const t = setTimeout(() => { setMessage(''); setError(''); }, 5000);
      return () => clearTimeout(t);
    }
  }, [message, error]);

  if (authUser?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  const fetchUsers = async () => {
    setLoadingU(true);
    try {
      const p = new URLSearchParams({ page: String(userPage), limit: '30' });
      const res = await axios.get(`/users?${p}`);
      const rows: UserRow[] = (res.data.users as any[])
        .filter(u => u.role !== 'admin')
        .map(u => ({ id: u.id || u._id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, isActive: u.isActive }));
      setUsers(rows);
      setTotalPages(res.data.totalPages ?? 1);
    } catch {}
    finally { setLoadingU(false); }
  };

  const fetchVendors = async () => {
    setLoadingV(true);
    try {
      const res = await axios.get('/access/me');
      const list: VendorItem[] = (res.data.access as any[]).map(v => ({
        vendorId:       String(v.vendorId),
        vendorName:     v.vendorName,
        carrier:        v.carrier,
        vendorType:     v.vendorType || 'api',
        shippingService:v.shippingService || '',
        baseRate:       v.baseRate,
        portal:         v.vendorType === 'manifest' ? 'manifest' : (v.portal || 'shippershub'),
      }));
      setVendors(list);
      const carriers = Array.from(new Set(list.map(v => v.carrier)));
      setOpenCarriers(carriers.reduce((a, c) => ({ ...a, [c]: true }), {}));
    } catch {}
    finally { setLoadingV(false); }
  };

  const filteredUsers = users.filter(u => {
    const matchQ = `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase());
    const matchR = !roleFilter || u.role === roleFilter;
    return matchQ && matchR;
  });

  const filteredVendors = vendors.filter(v =>
    !vendorSearch || `${v.vendorName} ${v.shippingService}`.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const allUsersChecked   = filteredUsers.length > 0 && filteredUsers.every(u => selectedU.has(u.id));
  const allVendorsChecked = filteredVendors.length > 0 && filteredVendors.every(v => selectedV.has(v.vendorId));

  const toggleUser = (id: string) => setSelectedU(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleVendor = (id: string) => setSelectedV(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAllUsers = () => {
    if (allUsersChecked) {
      setSelectedU(s => { const n = new Set(s); filteredUsers.forEach(u => n.delete(u.id)); return n; });
    } else {
      setSelectedU(s => { const n = new Set(s); filteredUsers.forEach(u => n.add(u.id)); return n; });
    }
  };

  const toggleAllVendors = () => {
    if (allVendorsChecked) {
      setSelectedV(s => { const n = new Set(s); filteredVendors.forEach(v => n.delete(v.vendorId)); return n; });
    } else {
      setSelectedV(s => { const n = new Set(s); filteredVendors.forEach(v => n.add(v.vendorId)); return n; });
    }
  };

  const applyAccess = async (isAllowed: boolean) => {
    if (!selectedU.size || !selectedV.size || applying) return;
    setApplying(true);
    try {
      const vendorEntries = vendors
        .filter(v => selectedV.has(v.vendorId))
        .map(v => ({ vendorId: v.vendorId, carrier: v.carrier }));
      await axios.put('/access/bulk/vendor-access', {
        userIds: Array.from(selectedU),
        vendorEntries,
        isAllowed,
      });
      setMessage(`${isAllowed ? 'Enabled' : 'Disabled'} ${vendorEntries.length} vendor(s) for ${selectedU.size} user(s)`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Operation failed');
    } finally {
      setApplying(false);
    }
  };

  const canApply = selectedU.size > 0 && selectedV.size > 0 && !applying;

  const openRateModal = () => {
    setFlatRate('');
    setTiers([{ minLbs: '0', maxLbs: '', rate: '' }]);
    setRateMode('replace');
    setShowRateModal(true);
  };

  const handleFlatRate = (val: string) => {
    setFlatRate(val);
    setTiers([{ minLbs: '0', maxLbs: '', rate: val }]);
  };

  const updateTier = (i: number, field: string, val: string) =>
    setTiers(ts => ts.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
  const addTier = () => setTiers(ts => [...ts, { minLbs: '', maxLbs: '', rate: '' }]);
  const removeTier = (i: number) => setTiers(ts => ts.filter((_, idx) => idx !== i));

  const applyRates = async () => {
    if (applyingRates) return;
    const validTiers = tiers
      .filter(t => t.rate !== '')
      .map(t => ({
        minLbs: parseFloat(t.minLbs) || 0,
        maxLbs: t.maxLbs === '' ? null : parseFloat(t.maxLbs),
        rate:   parseFloat(t.rate)   || 0,
      }));
    if (validTiers.length === 0) { setError('Add at least one tier with a rate.'); return; }
    setApplyingRates(true);
    try {
      const vendorEntries = vendors.filter(v => selectedV.has(v.vendorId)).map(v => ({ vendorId: v.vendorId, carrier: v.carrier }));
      const result = await axios.put('/access/bulk/rates', {
        userIds: Array.from(selectedU),
        vendorEntries,
        rateTiers: validTiers,
        mode: rateMode,
      });
      setMessage(result.data.message);
      setShowRateModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to apply rates');
    } finally {
      setApplyingRates(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <button
              onClick={() => navigate('/admin/users')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontFamily: FONT, fontWeight: 600 }}
            >
              <ArrowLeftIcon style={{ width: 13, height: 13 }} /> Users
            </button>
            <span style={{ color: 'var(--navy-200)', fontSize: '0.8rem' }}>›</span>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.5px', fontFamily: FONT }}>
              Bulk Vendor Access
            </h1>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99, fontFamily: FONT }}>Admin</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'Users',            value: users.length,    color: 'var(--navy-600)', bg: 'var(--navy-50)',          border: 'var(--navy-200)' },
              { label: 'Vendors',          value: vendors.length,  color: '#6366f1',         bg: 'rgba(99,102,241,0.07)',   border: 'rgba(99,102,241,0.2)' },
              { label: 'Users Selected',   value: selectedU.size,  color: '#10b981',         bg: 'rgba(16,185,129,0.07)',   border: 'rgba(16,185,129,0.2)' },
              { label: 'Vendors Selected', value: selectedV.size,  color: '#f59e0b',         bg: 'rgba(245,158,11,0.07)',   border: 'rgba(245,158,11,0.2)' },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: bg, border: `1px solid ${border}`, borderRadius: 99 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color, fontFamily: FONT }}>{value}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--navy-400)', fontFamily: FONT }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {(message || error) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '0.65rem 1rem',
          borderRadius: 10, fontFamily: FONT, fontSize: '0.82rem', fontWeight: 600,
          background: message ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${message ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          color: message ? '#10b981' : '#ef4444',
        }}>
          {message
            ? <CheckCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
            : <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />}
          {message || error}
          <button onClick={() => { setMessage(''); setError(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2, display: 'flex' }}>
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}

      {/* Action bar — shown when at least one side has selections */}
      {(selectedU.size > 0 || selectedV.size > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          padding: '0.7rem 1.1rem', borderRadius: 12, fontFamily: FONT,
          background: 'linear-gradient(135deg,rgba(99,102,241,0.07),rgba(99,102,241,0.02))',
          border: '1.5px solid rgba(99,102,241,0.18)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <UsersIcon style={{ width: 13, height: 13, color: selectedU.size > 0 ? '#10b981' : 'var(--navy-300)' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: selectedU.size > 0 ? 'var(--navy-800)' : 'var(--navy-400)', fontFamily: FONT }}>
                {selectedU.size > 0 ? `${selectedU.size} user${selectedU.size !== 1 ? 's' : ''}` : 'No users selected'}
              </span>
            </div>
            <span style={{ color: 'var(--navy-200)' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <TagIcon style={{ width: 13, height: 13, color: selectedV.size > 0 ? '#f59e0b' : 'var(--navy-300)' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: selectedV.size > 0 ? 'var(--navy-800)' : 'var(--navy-400)', fontFamily: FONT }}>
                {selectedV.size > 0 ? `${selectedV.size} vendor${selectedV.size !== 1 ? 's' : ''}` : 'No vendors selected'}
              </span>
            </div>
            {selectedU.size > 0 && selectedV.size > 0 && (
              <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: FONT }}>
                · {selectedU.size} × {selectedV.size} = {selectedU.size * selectedV.size} record{selectedU.size * selectedV.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button
              onClick={() => applyAccess(true)}
              disabled={!canApply}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.1rem',
                borderRadius: 8, border: 'none',
                background: canApply ? 'linear-gradient(135deg,#10b981,#059669)' : 'var(--navy-100)',
                color: canApply ? '#fff' : 'var(--navy-400)',
                fontSize: '0.82rem', fontWeight: 700, cursor: canApply ? 'pointer' : 'not-allowed',
                fontFamily: FONT, boxShadow: canApply ? '0 4px 12px rgba(16,185,129,0.3)' : 'none',
                transition: 'all 0.15s', opacity: applying ? 0.7 : 1,
              }}
            >
              <ShieldCheckIcon style={{ width: 14, height: 14 }} />
              {applying ? 'Applying…' : `Enable for ${selectedU.size || '—'}`}
            </button>
            <button
              onClick={() => applyAccess(false)}
              disabled={!canApply}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.1rem',
                borderRadius: 8,
                border: `1.5px solid ${canApply ? 'rgba(239,68,68,0.3)' : 'var(--navy-100)'}`,
                background: canApply ? 'rgba(239,68,68,0.07)' : 'transparent',
                color: canApply ? '#ef4444' : 'var(--navy-400)',
                fontSize: '0.82rem', fontWeight: 700, cursor: canApply ? 'pointer' : 'not-allowed',
                fontFamily: FONT, transition: 'all 0.15s', opacity: applying ? 0.7 : 1,
              }}
            >
              <ShieldExclamationIcon style={{ width: 14, height: 14 }} />
              {applying ? 'Applying…' : `Disable for ${selectedU.size || '—'}`}
            </button>
            <button
              onClick={openRateModal}
              disabled={!canApply}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.1rem',
                borderRadius: 8, border: 'none',
                background: canApply ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'var(--navy-100)',
                color: canApply ? '#fff' : 'var(--navy-400)',
                fontSize: '0.82rem', fontWeight: 700, cursor: canApply ? 'pointer' : 'not-allowed',
                fontFamily: FONT, boxShadow: canApply ? '0 4px 12px rgba(99,102,241,0.35)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <CurrencyDollarIcon style={{ width: 14, height: 14 }} />
              Set Rates
            </button>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '0.875rem', alignItems: 'start' }}>

        {/* ── LEFT: Users ──────────────────────────────────── */}
        <div className="db-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100vh - 220px)' }}>

          {/* Header */}
          <div style={{ padding: '0.8rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <UsersIcon style={{ width: 13, height: 13, color: 'var(--navy-400)' }} />
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>Users</span>
              </div>
              {selectedU.size > 0 && (
                <button onClick={() => setSelectedU(new Set())}
                  style={{ fontSize: '0.67rem', fontWeight: 600, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                  Clear {selectedU.size}
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--navy-400)', pointerEvents: 'none' }} />
              <input type="text" style={{ ...inp, paddingLeft: '1.85rem', fontSize: '0.78rem' }}
                placeholder="Search users…" value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                onFocus={focusI} onBlur={blurI} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([['', 'All'], ['user', 'Users'], ['reseller', 'Resellers']] as [string, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setRoleFilter(val as any)}
                  style={{
                    flex: 1, padding: '4px 0', borderRadius: 6, border: 'none',
                    background: roleFilter === val ? 'rgba(99,102,241,0.12)' : 'var(--navy-50)',
                    color: roleFilter === val ? '#6366f1' : 'var(--navy-500)',
                    fontSize: '0.67rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
                    outline: roleFilter === val ? '1.5px solid rgba(99,102,241,0.22)' : 'none',
                    transition: 'all 0.12s',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Select-all row */}
          <div
            onClick={toggleAllUsers}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '0.45rem 0.8rem',
              borderBottom: '1px solid var(--navy-50)', cursor: 'pointer',
              background: allUsersChecked ? 'rgba(99,102,241,0.04)' : 'transparent',
            }}
          >
            <input type="checkbox"
              ref={el => { if (el) el.indeterminate = !allUsersChecked && filteredUsers.some(u => selectedU.has(u.id)); }}
              checked={allUsersChecked} onChange={toggleAllUsers}
              onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--navy-500)', fontFamily: FONT }}>
              Select all ({filteredUsers.length})
            </span>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.35rem' }}>
            {loadingU ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--navy-400)', fontSize: '0.8rem', fontFamily: FONT }}>No users found</div>
            ) : filteredUsers.map(u => {
              const isSelected = selectedU.has(u.id);
              const rs = ROLE_STYLE[u.role] ?? ROLE_STYLE.user;
              return (
                <div key={u.id} onClick={() => toggleUser(u.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '0.45rem 0.55rem',
                    borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                    background: isSelected ? 'rgba(99,102,241,0.07)' : 'transparent',
                    border: `1.5px solid ${isSelected ? 'rgba(99,102,241,0.2)' : 'transparent'}`,
                    borderLeft: `2.5px solid ${isSelected ? '#6366f1' : 'transparent'}`,
                    transition: 'all 0.1s',
                  }}
                >
                  <input type="checkbox" checked={isSelected} onChange={() => toggleUser(u.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', flexShrink: 0 }} />
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: u.isActive ? rs.grad : 'linear-gradient(135deg,#94a3b8,#64748b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#fff', fontFamily: FONT }}>
                    {u.firstName[0]}{u.lastName[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.77rem', fontWeight: 600, color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>
                      {u.firstName} {u.lastName}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT }}>{u.email}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <span style={{ padding: '1px 6px', borderRadius: 99, fontSize: '0.57rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: rs.bg, color: rs.color, border: `1px solid ${rs.border}`, fontFamily: FONT }}>
                      {u.role}
                    </span>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: u.isActive ? '#10b981' : '#ef4444' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ borderTop: '1px solid var(--navy-100)', padding: '0.45rem 0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.67rem', color: 'var(--navy-400)', fontFamily: FONT }}>{userPage} / {totalPages}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button disabled={userPage === 1} onClick={() => setUserPage(p => p - 1)}
                  style={{ width: 24, height: 24, borderRadius: 5, border: '1.5px solid var(--navy-200)', background: 'transparent', cursor: userPage === 1 ? 'not-allowed' : 'pointer', color: 'var(--navy-500)', opacity: userPage === 1 ? 0.4 : 1, fontWeight: 700, fontSize: '0.8rem' }}>‹</button>
                <button disabled={userPage === totalPages} onClick={() => setUserPage(p => p + 1)}
                  style={{ width: 24, height: 24, borderRadius: 5, border: '1.5px solid var(--navy-200)', background: 'transparent', cursor: userPage === totalPages ? 'not-allowed' : 'pointer', color: 'var(--navy-500)', opacity: userPage === totalPages ? 0.4 : 1, fontWeight: 700, fontSize: '0.8rem' }}>›</button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Vendors ───────────────────────────────── */}
        <div className="db-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100vh - 220px)' }}>

          {/* Header */}
          <div style={{ padding: '0.8rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TagIcon style={{ width: 13, height: 13, color: 'var(--navy-400)' }} />
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>Vendors</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {selectedV.size > 0 && (
                  <button onClick={() => setSelectedV(new Set())}
                    style={{ fontSize: '0.67rem', fontWeight: 600, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
                    Clear {selectedV.size}
                  </button>
                )}
                <button onClick={toggleAllVendors}
                  style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--navy-600)', background: 'var(--navy-50)', border: '1px solid var(--navy-200)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: FONT }}>
                  {allVendorsChecked ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--navy-400)', pointerEvents: 'none' }} />
              <input type="text" style={{ ...inp, paddingLeft: '1.85rem', fontSize: '0.78rem' }}
                placeholder="Search vendors…" value={vendorSearch}
                onChange={e => setVendorSearch(e.target.value)}
                onFocus={focusI} onBlur={blurI} />
            </div>
          </div>

          {/* Vendor list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {loadingV ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
            ) : filteredVendors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--navy-400)', fontSize: '0.8rem', fontFamily: FONT }}>No vendors found</div>
            ) : (
              CARRIERS_ORDER.map(carrier => {
                const cv = filteredVendors.filter(v => v.carrier === carrier);
                if (cv.length === 0) return null;
                const cfg     = CARRIER_BG[carrier] || { border: 'var(--navy-200)', headerBg: 'var(--navy-50)' };
                const isOpen  = openCarriers[carrier] ?? true;
                const selCount = cv.filter(v => selectedV.has(v.vendorId)).length;

                // group api vendors by portal, then manifest separately
                const apiGroups: Record<string, VendorItem[]> = {};
                const manifestVs: VendorItem[] = [];
                cv.forEach(v => {
                  if (v.vendorType === 'manifest') { manifestVs.push(v); return; }
                  const p = v.portal || 'shippershub';
                  if (!apiGroups[p]) apiGroups[p] = [];
                  apiGroups[p].push(v);
                });

                return (
                  <div key={carrier} style={{ border: `1.5px solid ${cfg.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                    {/* Carrier header */}
                    <div
                      onClick={() => setOpenCarriers(o => ({ ...o, [carrier]: !o[carrier] }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.52rem 0.875rem', background: cfg.headerBg, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <CarrierBadge carrier={carrier} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.79rem', color: 'var(--navy-900)', fontFamily: FONT }}>{carrier}</span>
                        <span style={{ marginLeft: 6, fontSize: '0.66rem', color: 'var(--navy-400)', fontFamily: FONT }}>{cv.length} vendor{cv.length !== 1 ? 's' : ''}</span>
                      </div>
                      {selCount > 0 && (
                        <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: '0.6rem', fontWeight: 700, background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)', fontFamily: FONT }}>
                          {selCount} selected
                        </span>
                      )}
                      {isOpen
                        ? <ChevronUpIcon style={{ width: 13, height: 13, color: 'var(--navy-400)', flexShrink: 0 }} />
                        : <ChevronDownIcon style={{ width: 13, height: 13, color: 'var(--navy-400)', flexShrink: 0 }} />}
                    </div>

                    {isOpen && (
                      <div style={{ background: 'var(--bg-card)' }}>
                        {Object.entries(apiGroups).map(([portal, pvs]) => {
                          const pm = PORTAL_META[portal] || PORTAL_META.shippershub;
                          return (
                            <React.Fragment key={portal}>
                              <div style={{ padding: '0.28rem 0.875rem', background: pm.bg, borderTop: `1px solid ${cfg.border}` }}>
                                <span style={{ fontSize: '0.57rem', fontWeight: 700, color: pm.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>{pm.label}</span>
                              </div>
                              {pvs.map((v, vi) => {
                                const isSel = selectedV.has(v.vendorId);
                                return (
                                  <div key={v.vendorId} onClick={() => toggleVendor(v.vendorId)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.875rem 0.4rem 1rem',
                                      cursor: 'pointer', borderTop: vi === 0 ? 'none' : '1px solid var(--navy-50)',
                                      background: isSel ? 'rgba(99,102,241,0.04)' : 'transparent',
                                      transition: 'background 0.1s',
                                    }}
                                  >
                                    <input type="checkbox" checked={isSel} onChange={() => toggleVendor(v.vendorId)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{ fontWeight: 600, fontSize: '0.76rem', color: 'var(--navy-900)', fontFamily: FONT }}>{v.vendorName}</span>
                                      {v.shippingService && (
                                        <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--navy-400)', fontFamily: FONT }}>{v.shippingService}</span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--navy-400)', flexShrink: 0, fontFamily: FONT }}>${v.baseRate.toFixed(2)}</span>
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}

                        {manifestVs.length > 0 && (
                          <>
                            <div style={{ padding: '0.28rem 0.875rem', background: PORTAL_META.manifest.bg, borderTop: `1px solid ${cfg.border}` }}>
                              <span style={{ fontSize: '0.57rem', fontWeight: 700, color: PORTAL_META.manifest.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>Manifest</span>
                            </div>
                            {manifestVs.map((v, vi) => {
                              const isSel = selectedV.has(v.vendorId);
                              return (
                                <div key={v.vendorId} onClick={() => toggleVendor(v.vendorId)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.875rem 0.4rem 1rem',
                                    cursor: 'pointer', borderTop: vi === 0 ? 'none' : '1px solid var(--navy-50)',
                                    background: isSel ? 'rgba(99,102,241,0.04)' : 'transparent',
                                    transition: 'background 0.1s',
                                  }}
                                >
                                  <input type="checkbox" checked={isSel} onChange={() => toggleVendor(v.vendorId)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.76rem', color: 'var(--navy-900)', fontFamily: FONT }}>{v.vendorName}</span>
                                  </div>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--navy-400)', flexShrink: 0, fontFamily: FONT }}>${v.baseRate.toFixed(2)}</span>
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Rate modal — portalled to avoid stacking context trap */}
      {showRateModal && ReactDOM.createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowRateModal(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
        >
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1.5px solid var(--navy-200)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 500, margin: '1rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>Bulk Set Rates</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 2, fontFamily: FONT }}>
                  {selectedU.size} user{selectedU.size !== 1 ? 's' : ''} × {selectedV.size} vendor{selectedV.size !== 1 ? 's' : ''} = {selectedU.size * selectedV.size} records
                </div>
              </div>
              <button onClick={() => setShowRateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4, display: 'flex' }}>
                <XMarkIcon style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Flat rate shortcut */}
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 6 }}>Quick flat rate (all weights)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--navy-500)', fontWeight: 600 }}>$</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="e.g. 0.40"
                    value={flatRate}
                    onChange={e => handleFlatRate(e.target.value)}
                    style={{ ...inp, width: 140, fontSize: '0.88rem', fontWeight: 700 }}
                    onFocus={focusI} onBlur={blurI}
                  />
                  <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontFamily: FONT }}>fills tier grid below</span>
                </div>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--navy-100)' }} />
                <span style={{ fontSize: '0.6rem', color: 'var(--navy-400)', fontFamily: FONT, fontWeight: 700, letterSpacing: '0.07em' }}>OR DEFINE WEIGHT TIERS</span>
                <div style={{ flex: 1, height: 1, background: 'var(--navy-100)' }} />
              </div>

              {/* Tier grid */}
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 32px', gap: 6, marginBottom: 5 }}>
                  {['Min (lbs)', 'Max (lbs)', 'Rate ($)', ''].map(h => (
                    <div key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>{h}</div>
                  ))}
                </div>
                {tiers.map((t, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 32px', gap: 6, marginBottom: 5 }}>
                    <input type="number" min="0" step="0.1" placeholder="0"
                      value={t.minLbs}
                      onChange={e => { setFlatRate(''); updateTier(i, 'minLbs', e.target.value); }}
                      style={{ ...inp, fontSize: '0.8rem' }} onFocus={focusI} onBlur={blurI} />
                    <input type="number" min="0" step="0.1" placeholder="∞"
                      value={t.maxLbs}
                      onChange={e => { setFlatRate(''); updateTier(i, 'maxLbs', e.target.value); }}
                      style={{ ...inp, fontSize: '0.8rem' }} onFocus={focusI} onBlur={blurI} />
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={t.rate}
                      onChange={e => { setFlatRate(''); updateTier(i, 'rate', e.target.value); }}
                      style={{ ...inp, fontSize: '0.8rem' }} onFocus={focusI} onBlur={blurI} />
                    <button
                      onClick={() => { setFlatRate(''); removeTier(i); }}
                      disabled={tiers.length === 1}
                      style={{ width: 32, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1.5px solid rgba(239,68,68,0.22)', borderRadius: 7, cursor: tiers.length === 1 ? 'not-allowed' : 'pointer', color: '#ef4444', opacity: tiers.length === 1 ? 0.3 : 1, flexShrink: 0 }}>
                      <TrashIcon style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { setFlatRate(''); addTier(); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2, padding: '5px 12px', borderRadius: 7, border: '1.5px dashed var(--navy-200)', background: 'transparent', color: 'var(--navy-500)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                  <PlusIcon style={{ width: 12, height: 12 }} /> Add tier
                </button>
              </div>

              {/* Apply mode */}
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 6 }}>Apply mode</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  {([
                    { val: 'replace'       as const, label: 'Replace all',     desc: 'Overwrites existing tiers for every selected user' },
                    { val: 'skip_existing' as const, label: 'Skip with tiers', desc: 'Only updates users who have no tiers yet'          },
                  ]).map(({ val, label, desc }) => (
                    <button key={val} onClick={() => setRateMode(val)}
                      style={{
                        flex: 1, padding: '0.55rem 0.75rem', borderRadius: 9, textAlign: 'left', cursor: 'pointer',
                        border: `1.5px solid ${rateMode === val ? 'rgba(99,102,241,0.4)' : 'var(--navy-200)'}`,
                        background: rateMode === val ? 'rgba(99,102,241,0.07)' : 'transparent',
                        transition: 'all 0.12s',
                      }}>
                      <div style={{ fontSize: '0.77rem', fontWeight: 700, color: rateMode === val ? '#6366f1' : 'var(--navy-700)', fontFamily: FONT }}>{label}</div>
                      <div style={{ fontSize: '0.63rem', color: 'var(--navy-400)', fontFamily: FONT, marginTop: 2 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowRateModal(false)}
                style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1.5px solid var(--navy-200)', background: 'transparent', color: 'var(--navy-600)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                Cancel
              </button>
              <button onClick={applyRates} disabled={applyingRates}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.25rem',
                  borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                  color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                  cursor: applyingRates ? 'not-allowed' : 'pointer',
                  fontFamily: FONT, opacity: applyingRates ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
                }}>
                <CurrencyDollarIcon style={{ width: 14, height: 14 }} />
                {applyingRates ? 'Applying…' : `Apply to ${selectedU.size} × ${selectedV.size}`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default BulkVendorAccess;
