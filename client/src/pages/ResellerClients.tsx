import React, { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  UserPlusIcon, PencilIcon, TrashIcon, EyeIcon,
  MagnifyingGlassIcon, UserGroupIcon, XMarkIcon,
  CheckCircleIcon, ExclamationCircleIcon, ScaleIcon,
  BanknotesIcon, CurrencyDollarIcon, PhotoIcon,
  ArrowUpTrayIcon, ArrowDownTrayIcon, AdjustmentsHorizontalIcon,
  PlusIcon, ChevronDownIcon, ChevronUpIcon,
} from '@heroicons/react/24/outline';

interface Client {
  id: string;
  _id?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'user';
  isActive: boolean;
  createdAt: string;
}
interface RateTier { minLbs: number; maxLbs: number | null; rate: number; }
interface VendorAccess {
  vendorId: string; vendorName: string; carrier: string;
  vendorType: 'api' | 'manifest';
  shippingService: string; baseRate: number; isAllowed: boolean; rateTiers: RateTier[];
}
interface Balance {
  currentBalance: number;
  recentTransactions: Array<{ type: string; amount: number; description: string; date: string }>;
}
interface PaymentLog {
  _id: string; amount: number; date: string; note: string;
  screenshots: string[];
  loggedBy?: { firstName: string; lastName: string };
}
type ActiveTab = 'edit' | 'balance' | 'tiers';
type BalAction = '' | 'topup' | 'deduct' | 'adjust';

const CARRIERS_ORDER = ['USPS', 'UPS', 'FedEx', 'DHL'];

const CARRIER_BG: Record<string, { border: string; headerBg: string }> = {
  USPS:  { border: 'rgba(0,75,135,0.22)',  headerBg: 'rgba(0,75,135,0.07)'  },
  UPS:   { border: 'rgba(75,20,0,0.22)',   headerBg: 'rgba(75,20,0,0.08)'   },
  FedEx: { border: 'rgba(77,20,140,0.22)', headerBg: 'rgba(77,20,140,0.07)' },
  DHL:   { border: 'rgba(212,5,17,0.22)',  headerBg: 'rgba(255,204,0,0.18)' },
};

const CarrierBadge: React.FC<{ carrier: string }> = ({ carrier }) => {
  const base: React.CSSProperties = { fontWeight: 900, fontSize: '0.78rem', letterSpacing: '0.07em', padding: '3px 8px', borderRadius: 5, display: 'inline-flex', alignItems: 'center' };
  if (carrier === 'FedEx') return <span style={{ fontWeight: 900, fontSize: '0.88rem' }}><span style={{ color: '#4D148C' }}>Fed</span><span style={{ color: '#FF6600' }}>Ex</span></span>;
  const s: Record<string, React.CSSProperties> = {
    USPS: { background: '#004B87', color: '#fff' },
    UPS:  { background: '#4B1400', color: '#FFB500' },
    DHL:  { background: '#FFCC00', color: '#D40511' },
  };
  return <span style={{ ...base, ...(s[carrier] || { background: '#334155', color: '#fff' }) }}>{carrier}</span>;
};

const txColor = (t: string) =>
  ({ topup: 'var(--success-600)', deduction: 'var(--danger-600)', adjustment: '#2563EB' }[t] ?? 'var(--navy-600)');
const txDot = (t: string) =>
  ({ topup: 'green', deduction: 'red', adjustment: 'gray' }[t] ?? 'gray');

const ResellerClients: React.FC = () => {
  const { user: authUser } = useAuth();
  const fetchingForRef = useRef<string | null>(null);

  // ── Clients list ─────────────────────────────────────────────
  const [clients,      setClients]      = useState<Client[]>([]);
  const [loadingList,  setLoadingList]  = useState(true);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── Right panel ──────────────────────────────────────────────
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isCreating,     setIsCreating]     = useState(false);
  const [activeTab,      setActiveTab]      = useState<ActiveTab>('edit');

  // ── Edit/Create form ─────────────────────────────────────────
  const blank = { firstName: '', lastName: '', email: '', password: '' };
  const [clientForm,  setClientForm]  = useState(blank);
  const [submitting,  setSubmitting]  = useState(false);

  // ── Balance tab ──────────────────────────────────────────────
  const [balance,       setBalance]       = useState<Balance | null>(null);
  const [loadingBal,    setLoadingBal]    = useState(false);
  const [balAction,     setBalAction]     = useState<BalAction>('');
  const [actionAmt,     setActionAmt]     = useState('');
  const [actionDesc,    setActionDesc]    = useState('');
  const [processingBal, setProcessingBal] = useState(false);
  const [showAllTx,     setShowAllTx]     = useState(false);

  // ── Payment logs ─────────────────────────────────────────────
  const [payLogs,     setPayLogs]     = useState<PaymentLog[]>([]);
  const [totalPaid,   setTotalPaid]   = useState(0);
  const [showPayForm, setShowPayForm] = useState(false);
  const [editPayLog,  setEditPayLog]  = useState<PaymentLog | null>(null);
  const [payAmt,      setPayAmt]      = useState('');
  const [payDate,     setPayDate]     = useState(new Date().toISOString().slice(0, 10));
  const [payNote,     setPayNote]     = useState('');
  const [payFiles,    setPayFiles]    = useState<File[]>([]);
  const [payRemove,   setPayRemove]   = useState<string[]>([]);
  const [savingPay,   setSavingPay]   = useState(false);
  const payFileRef = useRef<HTMLInputElement>(null);

  // ── Rate Tiers tab ───────────────────────────────────────────
  const [access,           setAccess]           = useState<VendorAccess[]>([]);
  const [loadingTiers,     setLoadingTiers]     = useState(false);
  const [savingTiers,      setSavingTiers]      = useState(false);
  const [expandedCarriers, setExpandedCarriers] = useState<Record<string, boolean>>({});
  const [expandedV,        setExpandedV]        = useState<Record<string, boolean>>({});

  // ── Notifications ────────────────────────────────────────────
  const [message, setMessage] = useState('');
  const [error,   setError]   = useState('');

  const clientId = (c: Client) => c._id || c.id;

  useEffect(() => { fetchClients(); }, [statusFilter]);

  useEffect(() => {
    if (!selectedClient || isCreating) return;
    if (activeTab === 'balance') { fetchBalance(clientId(selectedClient)); fetchPayLogs(clientId(selectedClient)); }
    if (activeTab === 'tiers')   fetchTiers(clientId(selectedClient));
  }, [activeTab, selectedClient]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (message || error) {
      const t = setTimeout(() => { setMessage(''); setError(''); }, 4000);
      return () => clearTimeout(t);
    }
  }, [message, error]);

  if (authUser?.role !== 'reseller' && authUser?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // ── API calls ─────────────────────────────────────────────────
  const fetchClients = async () => {
    setLoadingList(true);
    try {
      const res = await axios.get('/users/reseller/clients');
      setClients(res.data.clients || []);
    } catch (e) { console.error(e); }
    finally { setLoadingList(false); }
  };

  const fetchBalance = async (id: string) => {
    setLoadingBal(true);
    try {
      const res = await axios.get(`/balance/${id}`);
      if (fetchingForRef.current === id) setBalance(res.data);
    } catch {}
    finally { setLoadingBal(false); }
  };

  const fetchPayLogs = async (id: string) => {
    try {
      const res = await axios.get(`/payment-logs/${id}`);
      if (fetchingForRef.current !== id) return; // discard stale response
      setPayLogs(res.data.logs || []);
      setTotalPaid(res.data.totalPaid || 0);
    } catch {}
  };

  const openPayForm = (log?: PaymentLog) => {
    setEditPayLog(log ?? null);
    setPayAmt(log ? String(log.amount) : '');
    setPayDate(log ? log.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setPayNote(log?.note ?? '');
    setPayFiles([]);
    setPayRemove([]);
    setShowPayForm(true);
  };

  const submitPayLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    setSavingPay(true);
    try {
      const fd = new FormData();
      fd.append('userId', clientId(selectedClient));
      fd.append('amount', payAmt);
      fd.append('date', payDate);
      fd.append('note', payNote);
      payFiles.forEach(f => fd.append('screenshots', f));
      payRemove.forEach(u => fd.append('removeScreenshots', u));
      if (editPayLog) {
        await axios.put(`/payment-logs/${editPayLog._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await axios.post('/payment-logs', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      setShowPayForm(false);
      fetchPayLogs(clientId(selectedClient));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Save failed');
    } finally { setSavingPay(false); }
  };

  const deletePayLog = async (id: string) => {
    if (!selectedClient || !window.confirm('Delete this payment entry?')) return;
    try {
      await axios.delete(`/payment-logs/${id}`);
      fetchPayLogs(clientId(selectedClient));
    } catch {}
  };

  const fetchTiers = async (id: string) => {
    setLoadingTiers(true);
    try {
      const res = await axios.get(`/access/${id}`);
      setAccess(res.data.access);
    } catch {}
    finally { setLoadingTiers(false); }
  };

  // ── Client actions ────────────────────────────────────────────
  const selectClient = (c: Client) => {
    fetchingForRef.current = clientId(c);
    setSelectedClient(c);
    setClientForm({ firstName: c.firstName, lastName: c.lastName, email: c.email, password: '' });
    setIsCreating(false);
    setActiveTab('edit');
    setBalAction('');
    setShowPayForm(false);
    setBalance(null);  // clear stale balance data
    setShowAllTx(false);
    setPayLogs([]);
    setTotalPaid(0);
  };

  const startCreate = () => {
    setIsCreating(true);
    setSelectedClient(null);
    setClientForm(blank);
    setActiveTab('edit');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError('');
    try {
      await axios.post('/users/reseller/clients', clientForm);
      setMessage('Client created');
      setIsCreating(false);
      setClientForm(blank);
      fetchClients();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to create'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    setSubmitting(true); setError('');
    try {
      await axios.put(`/users/${clientId(selectedClient)}`, {
        firstName: clientForm.firstName,
        lastName:  clientForm.lastName,
        email:     clientForm.email,
      });
      setMessage('Saved');
      setSelectedClient(prev => prev ? { ...prev, ...clientForm } : null);
      fetchClients();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to update'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (c: Client) => {
    if (!window.confirm(`Delete ${c.firstName} ${c.lastName}? This cannot be undone.`)) return;
    try {
      await axios.delete(`/users/reseller/clients/${clientId(c)}`);
      setMessage('Client deleted');
      if (selectedClient && clientId(selectedClient) === clientId(c)) {
        setSelectedClient(null); setIsCreating(false);
      }
      fetchClients();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
  };

  const handleToggleStatus = async (c: Client) => {
    try {
      await axios.put(`/users/${clientId(c)}`, { isActive: !c.isActive });
      setMessage(`${c.firstName} ${!c.isActive ? 'activated' : 'deactivated'}`);
      fetchClients();
      if (selectedClient && clientId(selectedClient) === clientId(c)) {
        setSelectedClient({ ...c, isActive: !c.isActive });
      }
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
  };

  // ── Balance actions ───────────────────────────────────────────
  const doBalanceAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !balAction) return;
    setProcessingBal(true);
    try {
      const ep = { topup: '/balance/topup', deduct: '/balance/deduct', adjust: '/balance/adjust' }[balAction]!;
      await axios.post(ep, {
        userId: clientId(selectedClient),
        amount: parseFloat(actionAmt),
        description: actionDesc || `${balAction} by ${authUser?.firstName}`,
      });
      setMessage('Balance updated');
      setBalAction(''); setActionAmt(''); setActionDesc('');
      fetchBalance(clientId(selectedClient));
    } catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
    finally { setProcessingBal(false); }
  };

  // ── Tiers save ────────────────────────────────────────────────
  const saveTiers = async () => {
    if (!selectedClient) return;
    setSavingTiers(true);
    try {
      const records = access.map(v => ({
        vendorId: v.vendorId, carrier: v.carrier, isAllowed: v.isAllowed, rateTiers: v.rateTiers,
      }));
      await axios.put(`/access/${clientId(selectedClient)}/bulk/save`, { records });
      setMessage('Rate tiers saved');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save'); }
    finally { setSavingTiers(false); }
  };

  const updateTierField = (vendorId: string, ti: number, field: string, val: any) =>
    setAccess(a => a.map(v => v.vendorId !== vendorId ? v : {
      ...v, rateTiers: v.rateTiers.map((t, i) => i === ti ? { ...t, [field]: val } : t)
    }));

  // ── Filtered list ─────────────────────────────────────────────
  const filtered = clients.filter(c => {
    const matchSearch = !searchTerm || `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !statusFilter || String(c.isActive) === statusFilter;
    return matchSearch && matchStatus;
  });

  const fmt = (v?: number) => `$${(v ?? 0).toFixed(2)}`;

  const Tab = ({ id, label, icon }: { id: ActiveTab; label: string; icon: React.ReactNode }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '0.5rem 0.875rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
        border: 'none', background: 'none', whiteSpace: 'nowrap',
        borderBottom: activeTab === id ? '2px solid var(--accent-600)' : '2px solid transparent',
        color: activeTab === id ? 'var(--accent-700)' : 'var(--navy-500)',
        display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'color 0.15s',
      }}
    >
      {icon} {label}
    </button>
  );

  const balActionCls: Record<string, string> = {
    topup: 'btn-success', deduct: 'btn-danger', adjust: 'btn-ghost',
  };

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Client Management</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Select a client to edit, manage balance, or configure rate tiers.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={startCreate}>
          <UserPlusIcon style={{ width: 14, height: 14 }} /> New Client
        </button>
      </div>

      {/* Toast */}
      {(message || error) && (
        <div className={`alert ${message ? 'alert-success' : 'alert-danger'}`} style={{ padding: '0.5rem 0.875rem' }}>
          {message
            ? <CheckCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
            : <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
          }
          <span style={{ fontSize: '0.82rem' }}>{message || error}</span>
          <button onClick={() => { setMessage(''); setError(''); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}>
            <XMarkIcon style={{ width: 13, height: 13 }} />
          </button>
        </div>
      )}

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '0.875rem', flex: 1, minHeight: 0 }}>

        {/* ── LEFT: Client List ──────────────────────────────── */}
        <div className="sh-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

          <div style={{ padding: '0.625rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--navy-400)', pointerEvents: 'none' }} />
              <input
                type="text" className="form-input"
                style={{ paddingLeft: '1.75rem', fontSize: '0.78rem', padding: '0.375rem 0.5rem 0.375rem 1.75rem' }}
                placeholder="Search clients…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <select className="form-input form-select" style={{ fontSize: '0.72rem', padding: '0.3rem 0.375rem' }}
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem' }}>
            {loadingList ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.78rem', padding: '1.5rem 0' }}>No clients found</p>
            ) : filtered.map(c => (
              <div
                key={clientId(c)}
                onClick={() => selectClient(c)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '0.45rem 0.5rem',
                  borderRadius: 6, cursor: 'pointer', marginBottom: 1,
                  background: selectedClient && clientId(selectedClient) === clientId(c) && !isCreating ? 'var(--accent-50)' : 'transparent',
                  border: `1.5px solid ${selectedClient && clientId(selectedClient) === clientId(c) && !isCreating ? 'var(--accent-200)' : 'transparent'}`,
                  transition: 'background 0.1s, border-color 0.1s',
                }}
              >
                <div className={`avatar avatar-sm ${c.isActive ? 'avatar-indigo' : ''}`}
                  style={!c.isActive ? { background: 'var(--navy-200)', color: 'var(--navy-500)' } : {}}>
                  {c.firstName.charAt(0)}{c.lastName.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.firstName} {c.lastName}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.email}
                  </div>
                </div>
                <span className={`status-dot ${c.isActive ? 'green' : 'red'}`} />
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--navy-100)', padding: '0.375rem 0.625rem' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>{clients.length} client{clients.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* ── RIGHT: Detail Panel ────────────────────────────── */}
        <div className="sh-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

          {!selectedClient && !isCreating ? (
            <div className="empty-state">
              <UserGroupIcon style={{ width: 36, height: 36 }} />
              <h3>Select a Client</h3>
              <p>Click any client on the left to edit, manage balance, or configure rate tiers.</p>
              <button className="btn btn-primary btn-sm" onClick={startCreate}>
                <UserPlusIcon style={{ width: 14, height: 14 }} /> Create first client
              </button>
            </div>
          ) : (
            <>
              {/* Panel header */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {isCreating ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
                    <UserPlusIcon style={{ width: 15, height: 15, color: 'var(--accent-600)' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--navy-900)' }}>New Client</span>
                  </div>
                ) : selectedClient && (
                  <>
                    <div className={`avatar avatar-sm ${selectedClient.isActive ? 'avatar-indigo' : ''}`}
                      style={!selectedClient.isActive ? { background: 'var(--navy-200)', color: 'var(--navy-500)' } : {}}>
                      {selectedClient.firstName.charAt(0)}{selectedClient.lastName.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--navy-900)' }}>
                        {selectedClient.firstName} {selectedClient.lastName}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{selectedClient.email}</div>
                    </div>
                    <span className={`badge ${selectedClient.isActive ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.65rem' }}>
                      {selectedClient.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button onClick={() => handleToggleStatus(selectedClient)} title={selectedClient.isActive ? 'Deactivate' : 'Activate'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: selectedClient.isActive ? 'var(--danger-500)' : 'var(--success-600)', padding: 3 }}>
                      <EyeIcon style={{ width: 15, height: 15 }} />
                    </button>
                    <button onClick={() => handleDelete(selectedClient)} title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 3 }}>
                      <TrashIcon style={{ width: 15, height: 15 }} />
                    </button>
                  </>
                )}
              </div>

              {/* Tabs — only for existing clients */}
              {!isCreating && selectedClient && (
                <div style={{ display: 'flex', borderBottom: '1px solid var(--navy-100)', padding: '0 0.75rem', flexShrink: 0, overflowX: 'auto' }}>
                  <Tab id="edit"    label="Profile"        icon={<PencilIcon    style={{ width: 12, height: 12 }} />} />
                  <Tab id="balance" label="Balance & Rate"  icon={<BanknotesIcon style={{ width: 12, height: 12 }} />} />
                  <Tab id="tiers"   label="Rate Tiers"      icon={<ScaleIcon     style={{ width: 12, height: 12 }} />} />
                </div>
              )}

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>

                {/* ── EDIT / CREATE FORM ── */}
                {(activeTab === 'edit' || isCreating) && (
                  <form onSubmit={isCreating ? handleCreate : handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 480 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                      <div>
                        <label className="form-label">First Name</label>
                        <input type="text" required className="form-input" value={clientForm.firstName}
                          onChange={e => setClientForm({ ...clientForm, firstName: e.target.value })} />
                      </div>
                      <div>
                        <label className="form-label">Last Name</label>
                        <input type="text" required className="form-input" value={clientForm.lastName}
                          onChange={e => setClientForm({ ...clientForm, lastName: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Email</label>
                      <input type="email" required className="form-input" value={clientForm.email}
                        onChange={e => setClientForm({ ...clientForm, email: e.target.value })} />
                    </div>
                    {isCreating && (
                      <div>
                        <label className="form-label">Login PIN</label>
                        <input type="password" required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} className="form-input" value={clientForm.password}
                          onChange={e => setClientForm({ ...clientForm, password: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
                        <p style={{ fontSize: '0.72rem', color: 'var(--navy-400)', marginTop: 3 }}>Enter exactly 6 digits</p>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 7, paddingTop: 2 }}>
                      {isCreating && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsCreating(false)}>Cancel</button>
                      )}
                      <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
                        {submitting ? (isCreating ? 'Creating…' : 'Saving…') : (isCreating ? 'Create Client' : 'Save Changes')}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── BALANCE & RATE TAB ── */}
                {activeTab === 'balance' && selectedClient && (
                  loadingBal ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                      {/* Balance stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                        <div style={{ background: 'var(--navy-25)', border: '1px solid var(--navy-100)', borderRadius: 10, padding: '0.875rem 1rem' }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <BanknotesIcon style={{ width: 11, height: 11 }} /> Current Balance
                          </div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.03em' }}>{fmt(balance?.currentBalance)}</div>
                        </div>
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '0.875rem 1rem' }}>
                          <div style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CurrencyDollarIcon style={{ width: 11, height: 11 }} /> Total Paid
                          </div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d', letterSpacing: '-0.03em' }}>{fmt(totalPaid)}</div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {([
                          { id: 'topup'  as BalAction, label: 'Top Up', icon: <ArrowUpTrayIcon style={{ width: 12, height: 12 }} /> },
                          { id: 'deduct' as BalAction, label: 'Deduct', icon: <ArrowDownTrayIcon style={{ width: 12, height: 12 }} /> },
                          { id: 'adjust' as BalAction, label: 'Adjust', icon: <AdjustmentsHorizontalIcon style={{ width: 12, height: 12 }} /> },
                        ]).map(a => (
                          <button key={a.id}
                            className={`btn btn-sm ${balAction === a.id ? balActionCls[a.id] : 'btn-ghost'}`}
                            onClick={() => setBalAction(balAction === a.id ? '' : a.id)}>
                            {a.icon} {a.label}
                          </button>
                        ))}
                      </div>

                      {/* Inline action form */}
                      {balAction && (
                        <form onSubmit={doBalanceAction} style={{ background: 'var(--navy-25)', border: '1px solid var(--navy-100)', borderRadius: 10, padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)', textTransform: 'capitalize' }}>
                            {balAction === 'adjust' ? 'Adjust Balance (+ or −)' : `${balAction} Balance`}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div>
                              <label className="form-label">{balAction === 'adjust' ? 'Amount (+ or −)' : 'Amount ($)'}</label>
                              <input type="number" step="0.01" required className="form-input"
                                min={balAction === 'adjust' ? undefined : '0.01'}
                                value={actionAmt} onChange={e => setActionAmt(e.target.value)}
                                placeholder="0.00" autoFocus />
                            </div>
                            <div>
                              <label className="form-label">Description</label>
                              <input type="text" className="form-input" value={actionDesc}
                                onChange={e => setActionDesc(e.target.value)} placeholder="Optional" />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="btn btn-ghost btn-sm"
                              onClick={() => { setBalAction(''); setActionAmt(''); setActionDesc(''); }}>Cancel</button>
                            <button type="submit" disabled={processingBal}
                              className={`btn btn-sm ${balActionCls[balAction as string] || 'btn-primary'}`}>
                              {processingBal ? 'Processing…' : 'Confirm'}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Transactions */}
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Transactions {balance?.recentTransactions?.length ? `(${balance.recentTransactions.length})` : ''}</span>
                          {(balance?.recentTransactions?.length ?? 0) > 5 && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '0.65rem', padding: '2px 7px' }}
                              onClick={() => setShowAllTx(v => !v)}
                            >
                              {showAllTx ? 'Show less' : `Show all ${balance!.recentTransactions.length}`}
                            </button>
                          )}
                        </div>
                        {!balance?.recentTransactions?.length ? (
                          <p style={{ fontSize: '0.8rem', color: 'var(--navy-400)' }}>No transactions yet.</p>
                        ) : (() => {
                          const txList = showAllTx ? balance.recentTransactions : balance.recentTransactions.slice(0, 5);
                          return txList.map((tx, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: i < txList.length - 1 ? '1px solid var(--navy-50)' : 'none' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span className={`status-dot ${txDot(tx.type)}`} />
                                <div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--navy-800)' }}>{tx.description}</div>
                                  <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>{new Date(tx.date).toLocaleDateString()}</div>
                                </div>
                              </div>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: txColor(tx.type) }}>
                                {tx.type === 'deduction' ? '−' : '+'}{fmt(tx.amount)}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>

                      {/* ── Payment Log ── */}
                      <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            Payment Received Log
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={() => openPayForm()}>
                            <PlusIcon style={{ width: 11, height: 11 }} /> Log Payment
                          </button>
                        </div>

                        {showPayForm && (
                          <form onSubmit={submitPayLog} style={{ background: 'var(--navy-25)', border: '1px solid var(--navy-100)', borderRadius: 10, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.625rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d' }}>
                              {editPayLog ? 'Edit Payment Entry' : 'Log Payment Received'}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                              <div>
                                <label className="form-label">Amount ($)</label>
                                <input type="number" step="0.01" min="0.01" required className="form-input"
                                  value={payAmt} onChange={e => setPayAmt(e.target.value)} placeholder="0.00" autoFocus />
                              </div>
                              <div>
                                <label className="form-label">Date</label>
                                <input type="date" required className="form-input"
                                  value={payDate} onChange={e => setPayDate(e.target.value)} />
                              </div>
                            </div>
                            <div>
                              <label className="form-label">Note</label>
                              <input type="text" className="form-input"
                                value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Wire, receipt #…" />
                            </div>

                            {editPayLog && editPayLog.screenshots.filter(s => !payRemove.includes(s)).length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {editPayLog.screenshots.filter(s => !payRemove.includes(s)).map(url => (
                                  <div key={url} style={{ position: 'relative' }}>
                                    <img src={url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--navy-100)' }}
                                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    <button type="button" onClick={() => setPayRemove(r => [...r, url])}
                                      style={{ position: 'absolute', top: -5, right: -5, background: '#dc2626', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <input type="file" ref={payFileRef} multiple accept="image/*,.pdf" style={{ display: 'none' }}
                                onChange={e => setPayFiles(Array.from(e.target.files || []))} />
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => payFileRef.current?.click()}>
                                <PhotoIcon style={{ width: 12, height: 12 }} />
                                {payFiles.length ? `${payFiles.length} file(s)` : 'Attach Screenshots'}
                              </button>
                              {payFiles.map((f, i) => (
                                <span key={i} style={{ fontSize: '0.68rem', background: 'var(--navy-50)', padding: '2px 7px', borderRadius: 4, color: 'var(--navy-700)' }}>
                                  {f.name}
                                  <button type="button" onClick={() => setPayFiles(fs => fs.filter((_, j) => j !== i))}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0 }}>×</button>
                                </span>
                              ))}
                            </div>

                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPayForm(false)}>Cancel</button>
                              <button type="submit" disabled={savingPay} className="btn btn-primary btn-sm">
                                {savingPay ? 'Saving…' : editPayLog ? 'Update' : 'Save'}
                              </button>
                            </div>
                          </form>
                        )}

                        {payLogs.length === 0 ? (
                          <p style={{ fontSize: '0.8rem', color: 'var(--navy-400)' }}>No payments logged yet.</p>
                        ) : payLogs.map((log, i) => (
                          <div key={log._id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '0.4rem 0', borderBottom: i < payLogs.length - 1 ? '1px solid var(--navy-50)' : 'none' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#15803d' }}>+{fmt(log.amount)}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{new Date(log.date).toLocaleDateString()}</span>
                                {log.screenshots.length > 0 && (
                                  <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <PhotoIcon style={{ width: 10, height: 10 }} />{log.screenshots.length}
                                  </span>
                                )}
                              </div>
                              {log.note && <div style={{ fontSize: '0.72rem', color: 'var(--navy-600)', marginTop: 1 }}>{log.note}</div>}
                              {log.loggedBy && <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>by {log.loggedBy.firstName} {log.loggedBy.lastName}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => openPayForm(log)}>
                                <PencilIcon style={{ width: 11, height: 11 }} />
                              </button>
                              <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: '#dc2626' }} onClick={() => deletePayLog(log._id)}>
                                <TrashIcon style={{ width: 11, height: 11 }} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  )
                )}

                {/* ── RATE TIERS TAB ── */}
                {activeTab === 'tiers' && selectedClient && (
                  loadingTiers ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--navy-400)', margin: '0 0 0.25rem' }}>
                        Expand a carrier to enable vendors and configure per-weight rate tiers.
                      </p>

                      {CARRIERS_ORDER.map(carrier => {
                        const allVendors      = access.filter(v => v.carrier === carrier);
                        const apiVendors      = allVendors.filter(v => v.vendorType !== 'manifest');
                        const manifestVendors = allVendors.filter(v => v.vendorType === 'manifest');
                        const enabledCount    = allVendors.filter(v => v.isAllowed).length;
                        const isCarrierOpen   = expandedCarriers[carrier] || false;
                        const cfg             = CARRIER_BG[carrier] || { border: 'var(--navy-200)', headerBg: 'var(--navy-50)' };

                        const renderVendorRow = (vendor: VendorAccess, vi: number, isFirst: boolean) => (
                          <div key={vendor.vendorId} style={{ borderTop: `1px solid ${isFirst ? cfg.border : 'var(--navy-75)'}` }}>
                            <div
                              onClick={() => vendor.isAllowed && setExpandedV(e => ({ ...e, [vendor.vendorId]: !e[vendor.vendorId] }))}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.45rem 0.875rem 0.45rem 1rem', background: vendor.isAllowed ? 'var(--success-50)' : 'transparent', cursor: vendor.isAllowed ? 'pointer' : 'default' }}
                            >
                              <input type="checkbox" checked={vendor.isAllowed} onClick={e => e.stopPropagation()}
                                onChange={() => setAccess(a => a.map(v => v.vendorId === vendor.vendorId ? { ...v, isAllowed: !v.isAllowed } : v))}
                                style={{ cursor: 'pointer', flexShrink: 0 }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.79rem', color: 'var(--navy-900)' }}>{vendor.vendorName}</span>
                                {vendor.shippingService && (
                                  <span style={{ marginLeft: 5, fontSize: '0.68rem', color: 'var(--navy-500)' }}>{vendor.shippingService}</span>
                                )}
                              </div>
                              <span style={{ fontSize: '0.68rem', color: 'var(--navy-500)', flexShrink: 0 }}>base {fmt(vendor.baseRate)}</span>
                              {vendor.isAllowed && <>
                                <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 8, background: vendor.rateTiers.length > 0 ? 'var(--accent-100)' : 'var(--navy-100)', color: vendor.rateTiers.length > 0 ? 'var(--accent-700)' : 'var(--navy-500)', flexShrink: 0 }}>
                                  {vendor.rateTiers.length}t
                                </span>
                                {expandedV[vendor.vendorId]
                                  ? <ChevronUpIcon style={{ width: 12, height: 12, color: 'var(--navy-400)', flexShrink: 0 }} />
                                  : <ChevronDownIcon style={{ width: 12, height: 12, color: 'var(--navy-400)', flexShrink: 0 }} />
                                }
                              </>}
                            </div>

                            {/* Tier editor */}
                            {expandedV[vendor.vendorId] && vendor.isAllowed && (
                              <div style={{ padding: '0.5rem 0.875rem 0.625rem 1.875rem', borderTop: '1px dashed var(--navy-100)', background: 'var(--navy-25)' }}>
                                {vendor.rateTiers.length === 0 ? (
                                  <p style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontStyle: 'italic', marginBottom: '0.375rem' }}>
                                    No tiers — using base rate {fmt(vendor.baseRate)} for all weights.
                                  </p>
                                ) : (
                                  <div style={{ marginBottom: '0.375rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '76px 76px 76px 24px', gap: 3, marginBottom: 3 }}>
                                      {['Min lbs', 'Max lbs', 'Rate ($)', ''].map((h, i) => (
                                        <div key={i} style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase' }}>{h}</div>
                                      ))}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                      {vendor.rateTiers.map((tier, ti) => (
                                        <div key={ti} style={{ display: 'grid', gridTemplateColumns: '76px 76px 76px 24px', gap: 3, alignItems: 'center' }}>
                                          <input type="number" min="0" className="form-input" style={{ padding: '0.25rem 0.35rem', fontSize: '0.76rem' }} value={tier.minLbs} onChange={e => updateTierField(vendor.vendorId, ti, 'minLbs', parseFloat(e.target.value) || 0)} />
                                          <input type="number" min="0" className="form-input" style={{ padding: '0.25rem 0.35rem', fontSize: '0.76rem' }} value={tier.maxLbs ?? ''} placeholder="∞" onChange={e => updateTierField(vendor.vendorId, ti, 'maxLbs', e.target.value ? parseFloat(e.target.value) : null)} />
                                          <input type="number" step="0.01" min="0" className="form-input" style={{ padding: '0.25rem 0.35rem', fontSize: '0.76rem' }} value={tier.rate} onChange={e => updateTierField(vendor.vendorId, ti, 'rate', parseFloat(e.target.value) || 0)} />
                                          <button onClick={() => setAccess(a => a.map(v => v.vendorId !== vendor.vendorId ? v : { ...v, rateTiers: v.rateTiers.filter((_, i) => i !== ti) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 1 }}>
                                            <XMarkIcon style={{ width: 12, height: 12 }} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <button
                                  onClick={() => setAccess(a => a.map(v => v.vendorId !== vendor.vendorId ? v : { ...v, rateTiers: [...v.rateTiers, { minLbs: 0, maxLbs: null, rate: v.baseRate }] }))}
                                  className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '2px 7px' }}>
                                  <PlusIcon style={{ width: 10, height: 10 }} /> Add Tier
                                </button>
                              </div>
                            )}
                          </div>
                        );

                        return (
                          <div key={carrier} style={{ border: `1.5px solid ${cfg.border}`, borderRadius: 10, overflow: 'hidden' }}>

                            {/* Carrier header */}
                            <div
                              onClick={() => setExpandedCarriers(e => ({ ...e, [carrier]: !e[carrier] }))}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.875rem', background: cfg.headerBg, cursor: 'pointer', userSelect: 'none' }}
                            >
                              <CarrierBadge carrier={carrier} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy-900)' }}>{carrier}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--navy-500)' }}>
                                  {allVendors.length === 0
                                    ? 'No vendors configured'
                                    : `${apiVendors.length} API · ${manifestVendors.length} Manifest · ${enabledCount} enabled`
                                  }
                                </div>
                              </div>
                              {allVendors.length > 0 && (
                                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                  {allVendors.slice(0, 4).map(v => (
                                    <span key={v.vendorId} title={v.vendorName} style={{ width: 7, height: 7, borderRadius: '50%', background: v.isAllowed ? 'var(--success-500)' : 'var(--navy-200)', display: 'inline-block' }} />
                                  ))}
                                  {allVendors.length > 4 && <span style={{ fontSize: '0.62rem', color: 'var(--navy-400)' }}>+{allVendors.length - 4}</span>}
                                </div>
                              )}
                              {isCarrierOpen
                                ? <ChevronUpIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
                                : <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
                              }
                            </div>

                            {/* Expanded body */}
                            {isCarrierOpen && (
                              <div style={{ background: '#fff' }}>

                                {/* API Vendors */}
                                {apiVendors.length > 0 && (
                                  <>
                                    <div style={{ padding: '0.35rem 0.875rem', background: 'var(--navy-50)', borderTop: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>API Vendors</span>
                                    </div>
                                    {apiVendors.map((vendor, vi) => renderVendorRow(vendor, vi, vi === 0))}
                                  </>
                                )}

                                {/* Manifest Vendors — view only, no Add button for resellers */}
                                {manifestVendors.length > 0 && (
                                  <>
                                    <div style={{ padding: '0.35rem 0.875rem', background: 'var(--navy-50)', borderTop: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Manifest Vendors</span>
                                    </div>
                                    {manifestVendors.map((vendor, vi) => renderVendorRow(vendor, vi, vi === 0))}
                                  </>
                                )}

                                {allVendors.length === 0 && (
                                  <div style={{ padding: '0.6rem 1rem', fontSize: '0.72rem', color: 'var(--navy-400)', fontStyle: 'italic' }}>
                                    No vendors configured for {carrier} yet.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                        <button className="btn btn-primary btn-sm" onClick={saveTiers} disabled={savingTiers}>
                          {savingTiers ? 'Saving…' : 'Save Rate Tiers'}
                        </button>
                      </div>
                    </div>
                  )
                )}

              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResellerClients;
