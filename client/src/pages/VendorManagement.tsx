import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon,
  CheckCircleIcon, ExclamationCircleIcon, XMarkIcon,
  BanknotesIcon, EyeIcon, EyeSlashIcon,
  UserGroupIcon, ArrowPathIcon, CloudArrowDownIcon,
} from '@heroicons/react/24/outline';

// ── Types ──────────────────────────────────────────────────────
interface ApiVendor {
  _id: string;
  name: string;
  carrier: string;
  shippingService: string;
  rate: number;
  isActive: boolean;
  source: string;
  shippershubCarrierId:  string | null;
  shippershubVendorId:   string | null;
  labelcrowSeriesId:     number | null;
  labelcrowProviderKey:  string | null;
  labelcrowServiceClass: string | null;
  shiplabelServiceId:    string | null;
  shiplabelLabelSeries:  string | null;
  shiplabelLabelFormat:  string | null;
  shiplabelSeries?:      { series: string; format: string; name?: string }[];
  createdAt: string;
}

// ShipLabel "Custom Label (Series & Format)" catalog. The ShipLabel API
// (/api/v2/services) only returns pre-packaged label products (2-3 of them), NOT
// this catalog — it is rendered server-side into the <select>s on the ShipLabel
// portal's custom-label page. Mirrored here verbatim from that page; update if
// ShipLabel changes their lists.
const SL_SERIES: { value: string; label: string }[] = [
  { value: '9488', label: '9488' },
  { value: '9501', label: '9501' },
  { value: '9505', label: '9505' },
  { value: '9559', label: '9559' },
  { value: '92019', label: '92019' },
  { value: '92020', label: '92020' },
  { value: '92022', label: '92022' },
  { value: '92612', label: '92612' },
  { value: '93001', label: '93001' },
  { value: '93020', label: '93020' },
  { value: '93055', label: '93055' },
  { value: '94001', label: '94001' },
  { value: '95346', label: '95346' },
  { value: '95701', label: '95701' },
  { value: '9201990', label: '9201990' },
  { value: '91028052', label: '91028052' },
  { value: '94055589', label: '94055589' },
  { value: '94055937', label: '94055937' },
  { value: '930210623', label: '9302 (Manifest)' },
  { value: '910280521368', label: '910280521368' },
  { value: '930201062339', label: '930201 (Non Manifest)' },
  { value: '930222083160', label: '930222 (Non Manifest)' },
  { value: '930222083160501', label: '930222 (Manifest)' },
  { value: '9234690208389319', label: '9234690208389319' },
  { value: 'user_own_trackings', label: 'My Custom Series' },
];

const SL_FORMATS: { value: string; label: string }[] = [
  { value: 'usps_priority_pro', label: 'USPS Priority Pro' },
  { value: 'usps_priority_private', label: 'USPS Priority Private' },
  { value: 'usps_priority_mail', label: 'USPS Priority Mail' },
  { value: 'usps_priority_pitneyBow', label: 'USPS Priority Mail PitneyBow' },
  { value: 'usps_priority_mail_commercial_easypost', label: 'USPS Priority Mail Commercial EasyPost' },
  { value: 'usps_ground_api', label: 'USPS Ground API' },
  { value: 'click_n_ship', label: 'Click-N-Ship' },
  { value: 'usps_ground_pro', label: 'USPS Ground Pro' },
  { value: 'usps_ground_advantage', label: 'USPS Ground Advantage' },
  { value: 'usps_priority_mail_epostage', label: 'USPS Priority Mail ePostage' },
  { value: 'usps_ground_advantage_atfm_epostage', label: 'USPS Ground Advantage ATFM ePostage' },
];

const slFormatLabel = (v: string) => SL_FORMATS.find(f => f.value === v)?.label || v;

interface ManifestVendor {
  _id: string;
  name: string;
  email: string;
  notifyEmail: string;
  carriers: string[];
  vendorRate: number;
  description: string;
  isActive: boolean;
  scoreOverride: number | null;
  score: number | null;
  payableBalance: number;
  totalPaidOut: number;
  stats: {
    totalJobs: number; onTimeUploads: number; lateUploads: number;
    completedJobs: number; rejectedJobs: number; totalLabels: number;
  };
  createdAt: string;
}

interface FormData {
  name: string; email: string; password: string; notifyEmail: string;
  carriers: string[]; vendorRate: number; description: string;
  isActive: boolean; scoreOverride: string;
}

const BLANK: FormData = {
  name: '', email: '', password: '', notifyEmail: '',
  carriers: [], vendorRate: 0, description: '',
  isActive: true, scoreOverride: '',
};

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;

const CARRIER_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  USPS:  { bg: '#e8f0fe', color: '#1a56db', border: '#bfdbfe' },
  UPS:   { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  FedEx: { bg: '#ede9fe', color: '#5b21b6', border: '#ddd6fe' },
  DHL:   { bg: '#fef9c3', color: '#713f12', border: '#fef08a' },
};

// ── Star rating display ────────────────────────────────────────
const StarRating = ({ score }: { score: number | null }) => {
  if (score === null || score === undefined) {
    return <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>No score yet</span>;
  }
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = i <= Math.floor(score);
    const half   = !filled && i - 0.5 <= score;
    stars.push(
      <span key={i} style={{ color: '#f59e0b', fontSize: '0.9rem' }}>
        {filled || half ? '★' : '☆'}
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {stars}
      <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginLeft: 4 }}>
        {score.toFixed(1)}
      </span>
    </div>
  );
};

// ── Modal ──────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal-box" style={{ maxWidth: 560, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3 className="modal-title" style={{ margin: 0 }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4 }}>
          <XMarkIcon style={{ width: 20, height: 20 }} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ── Vendor form ────────────────────────────────────────────────
const VendorForm = ({ form, setForm, isEdit }: { form: FormData; setForm: (f: FormData) => void; isEdit?: boolean }) => {
  const [showPw, setShowPw] = React.useState(false);
  const set = (key: keyof FormData, val: any) => setForm({ ...form, [key]: val });

  const toggleCarrier = (c: string) => {
    set('carriers', form.carriers.includes(c)
      ? form.carriers.filter(x => x !== c)
      : [...form.carriers, c]
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Name + email */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="form-label">Vendor Name *</label>
          <input className="form-input" required value={form.name}
            onChange={e => set('name', e.target.value)} placeholder="e.g. Arslan Logistics" />
        </div>
        <div>
          <label className="form-label">Login Email *</label>
          <input className="form-input" type="email" required value={form.email}
            onChange={e => set('email', e.target.value)} placeholder="vendor@example.com" />
        </div>
      </div>

      {/* Password + notify email */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="form-label">
            Portal Password {isEdit && <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}>(blank = keep current)</span>}
          </label>
          <div style={{ position: 'relative' }}>
            <input className="form-input" type={showPw ? 'text' : 'password'}
              value={form.password} onChange={e => set('password', e.target.value)}
              placeholder={isEdit ? '••••••••' : 'Set a password'}
              style={{ paddingRight: '2.5rem' }} />
            <button type="button" onClick={() => setShowPw(p => !p)} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)',
            }}>
              {showPw ? <EyeSlashIcon style={{ width: 16, height: 16 }} /> : <EyeIcon style={{ width: 16, height: 16 }} />}
            </button>
          </div>
        </div>
        <div>
          <label className="form-label">Notification Email <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}>(optional)</span></label>
          <input className="form-input" type="email" value={form.notifyEmail}
            onChange={e => set('notifyEmail', e.target.value)} placeholder="Same as login if blank" />
        </div>
      </div>

      {/* Carriers */}
      <div>
        <label className="form-label">Supported Carriers *</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CARRIERS.map(c => {
            const s = CARRIER_STYLES[c];
            const checked = form.carriers.includes(c);
            return (
              <button key={c} type="button" onClick={() => toggleCarrier(c)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                border: `2px solid ${checked ? s.border : 'var(--navy-200)'}`,
                background: checked ? s.bg : 'transparent',
                color: checked ? s.color : 'var(--navy-500)',
                transition: 'all 120ms',
              }}>
                {c}
              </button>
            );
          })}
        </div>
        {form.carriers.length === 0 && (
          <p style={{ fontSize: '0.72rem', color: 'var(--danger-600)', marginTop: 4 }}>Select at least one carrier</p>
        )}
      </div>

      {/* Vendor rate + score override */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="form-label">Vendor Rate ($/label)</label>
          <input className="form-input" type="number" step="0.01" min="0"
            value={form.vendorRate} onChange={e => set('vendorRate', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className="form-label">Score Override <span style={{ color: 'var(--navy-400)', fontWeight: 400 }}>(1–5, blank = auto)</span></label>
          <input className="form-input" type="number" step="0.5" min="1" max="5"
            value={form.scoreOverride} onChange={e => set('scoreOverride', e.target.value)}
            placeholder="Auto" />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="form-label">Description / Notes</label>
        <input className="form-input" value={form.description}
          onChange={e => set('description', e.target.value)} placeholder="Optional internal note" />
      </div>

      {/* Active toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" id="isActive" checked={form.isActive}
          onChange={e => set('isActive', e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--accent-600)' }} />
        <label htmlFor="isActive" style={{ fontSize: '0.875rem', color: 'var(--navy-700)', cursor: 'pointer' }}>
          Active (vendor can log in and process jobs)
        </label>
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────
const VendorManagement: React.FC = () => {
  const { user } = useAuth();

  const [activeTab,     setActiveTab]     = useState<'api' | 'manifest'>('api');
  const [activePortal,  setActivePortal]  = useState<'shippershub' | 'labelcrow' | 'shiplabel'>('shippershub');

  // API vendors (ShippersHub)
  const [apiVendors,    setApiVendors]    = useState<ApiVendor[]>([]);
  const [apiLoading,    setApiLoading]    = useState(true);
  const [importing,     setImporting]     = useState(false);
  const [editApi,       setEditApi]       = useState<ApiVendor | null>(null);
  const [apiRate,       setApiRate]       = useState('');
  const [apiActive,     setApiActive]     = useState(true);
  const [apiSeries,     setApiSeries]     = useState<{ series: string; format: string; name: string }[]>([]);
  const [apiSaving,     setApiSaving]     = useState(false);
  const [diagLoading,   setDiagLoading]   = useState(false);
  const [diagData,      setDiagData]      = useState<any[] | null>(null);
  const [diagError,     setDiagError]     = useState('');

  // API vendors (Label Crow)
  const [lcVendors,     setLcVendors]     = useState<ApiVendor[]>([]);
  const [lcSyncing,     setLcSyncing]     = useState(false);

  // API vendors (ShipLabel)
  const [slVendors,     setSlVendors]     = useState<ApiVendor[]>([]);
  const [slSyncing,     setSlSyncing]     = useState(false);
  const [slCustomOpen,  setSlCustomOpen]  = useState(false);
  const [slPickSeries,  setSlPickSeries]  = useState<string[]>([]);
  const [slPickFormats, setSlPickFormats] = useState<string[]>([]);
  const [slCustomRate,  setSlCustomRate]  = useState('');
  const [slCustomSaving, setSlCustomSaving] = useState(false);

  // Manifest vendors
  const [vendors,       setVendors]       = useState<ManifestVendor[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [search,        setSearch]        = useState('');
  const [showCreate,    setShowCreate]    = useState(false);
  const [editVendor,    setEditVendor]    = useState<ManifestVendor | null>(null);
  const [form,          setForm]          = useState<FormData>(BLANK);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [message,       setMessage]       = useState('');
  const [error,         setError]         = useState('');
  // Payout state
  const [payoutVendor,  setPayoutVendor]  = useState<ManifestVendor | null>(null);
  const [payoutAmt,     setPayoutAmt]     = useState('');
  const [payoutNote,    setPayoutNote]    = useState('');
  const [payoutBusy,    setPayoutBusy]    = useState(false);

  useEffect(() => { fetchVendors(); fetchApiVendors(); }, []);

  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  const fetchApiVendors = async () => {
    setApiLoading(true);
    try {
      const res = await axios.get('/vendors');
      const all: ApiVendor[] = res.data.vendors || [];
      setApiVendors(all.filter(v => v.source === 'shippershub'));
      setLcVendors(all.filter(v => v.source === 'labelcrow'));
      setSlVendors(all.filter(v => v.source === 'shiplabel'));
    } catch { /* ignore */ }
    finally { setApiLoading(false); }
  };

  const handleImportShippersHub = async () => {
    setImporting(true);
    try {
      const res = await axios.post('/vendors/import-from-shippershub');
      notify(res.data.message || 'Sync complete');
      fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Sync failed', true); }
    finally { setImporting(false); }
  };

  const openEditApi = (v: ApiVendor) => {
    setEditApi(v);
    setApiRate(String(v.rate));
    setApiActive(v.isActive);
    setApiSeries((v.shiplabelSeries || []).map(s => ({
      series: s.series, format: s.format, name: s.name || '',
    })));
  };

  const handleSaveApi = async () => {
    if (!editApi) return;
    setApiSaving(true);
    try {
      const body: Record<string, unknown> = { rate: parseFloat(apiRate) || 0, isActive: apiActive };
      if (editApi.source === 'shiplabel') {
        body.shiplabelSeries = apiSeries
          .map(s => ({ series: s.series.trim(), format: s.format.trim(), name: s.name.trim() }))
          .filter(s => s.series && s.format);
      }
      await axios.put(`/vendors/${editApi._id}`, body);
      notify('Vendor updated');
      setEditApi(null);
      fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Update failed', true); }
    finally { setApiSaving(false); }
  };

  const addSeriesRow = () => setApiSeries(rows => [...rows, { series: SL_SERIES[0].value, format: SL_FORMATS[0].value, name: '' }]);
  const updateSeriesRow = (i: number, patch: Partial<{ series: string; format: string; name: string }>) =>
    setApiSeries(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const removeSeriesRow = (i: number) => setApiSeries(rows => rows.filter((_, idx) => idx !== i));

  const handleDeleteApi = async (v: ApiVendor) => {
    if (!window.confirm(`Delete "${v.name}"?`)) return;
    try {
      await axios.delete(`/vendors/${v._id}`);
      notify('Vendor deleted');
      fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Delete failed', true); }
  };

  const handleDiagnose = async () => {
    setDiagLoading(true); setDiagData(null); setDiagError('');
    try {
      const res = await axios.get('/shippershub-accounts/carriers');
      setDiagData(res.data.carriers || []);
    } catch (err: any) {
      setDiagError(err.response?.data?.message || 'Could not connect to ShippersHub');
    } finally { setDiagLoading(false); }
  };

  const handleSyncLabelCrow = async () => {
    setLcSyncing(true);
    try {
      const res = await axios.post('/vendors/import-from-labelcrow');
      notify(res.data.message || 'Label Crow sync complete');
      fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Label Crow sync failed', true); }
    finally { setLcSyncing(false); }
  };

  const handleSyncShipLabel = async () => {
    setSlSyncing(true);
    try {
      const res = await axios.post('/vendors/import-from-shiplabel');
      notify(res.data.message || 'ShipLabel sync complete');
      fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'ShipLabel sync failed', true); }
    finally { setSlSyncing(false); }
  };

  const openSlCustom = () => {
    setSlPickSeries([]);
    setSlPickFormats([]);
    setSlCustomRate('');
    setSlCustomOpen(true);
  };
  const toggleSlSeries  = (v: string) => setSlPickSeries(xs => xs.includes(v) ? xs.filter(x => x !== v) : [...xs, v]);
  const toggleSlFormat  = (v: string) => setSlPickFormats(xs => xs.includes(v) ? xs.filter(x => x !== v) : [...xs, v]);

  const handleCreateCustomSlVendor = async () => {
    if (!slPickSeries.length || !slPickFormats.length) {
      notify('Pick at least one series and one format', true);
      return;
    }
    setSlCustomSaving(true);
    try {
      const res = await axios.post('/vendors/shiplabel-custom', {
        series: slPickSeries,
        format: slPickFormats,
        rate: parseFloat(slCustomRate) || 0,
      });
      notify(res.data.message || 'Custom series vendors created');
      setSlCustomOpen(false);
      fetchApiVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Create failed', true); }
    finally { setSlCustomSaving(false); }
  };

  const fetchVendors = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/manifest-vendors');
      setVendors(res.data.vendors || []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  };

  const notify = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setMessage(''); } else { setMessage(msg); setError(''); }
    setTimeout(() => { setMessage(''); setError(''); }, 4000);
  };

  // ── Create ──────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.carriers.length === 0) { notify('Select at least one carrier', true); return; }
    setIsSubmitting(true);
    try {
      const payload: any = { ...form, scoreOverride: form.scoreOverride !== '' ? parseFloat(form.scoreOverride) : null };
      if (!payload.password) delete payload.password;
      await axios.post('/manifest-vendors', payload);
      notify('Vendor created');
      setShowCreate(false); setForm(BLANK); fetchVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Failed to create vendor', true); }
    finally { setIsSubmitting(false); }
  };

  // ── Edit ────────────────────────────────────────────────────
  const openEdit = (v: ManifestVendor) => {
    setEditVendor(v);
    setForm({
      name: v.name, email: v.email, password: '',
      notifyEmail: v.notifyEmail || '',
      carriers: v.carriers || [],
      vendorRate: v.vendorRate || 0,
      description: v.description || '',
      isActive: v.isActive,
      scoreOverride: v.scoreOverride !== null && v.scoreOverride !== undefined ? String(v.scoreOverride) : '',
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVendor) return;
    if (form.carriers.length === 0) { notify('Select at least one carrier', true); return; }
    setIsSubmitting(true);
    try {
      const payload: any = { ...form, scoreOverride: form.scoreOverride !== '' ? parseFloat(form.scoreOverride) : null };
      if (!payload.password) delete payload.password;
      await axios.put(`/manifest-vendors/${editVendor._id}`, payload);
      notify('Vendor updated');
      setEditVendor(null); setForm(BLANK); fetchVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Failed to update vendor', true); }
    finally { setIsSubmitting(false); }
  };

  // ── Delete ──────────────────────────────────────────────────
  const handleDelete = async (v: ManifestVendor) => {
    if (!window.confirm(`Delete "${v.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/manifest-vendors/${v._id}`);
      notify('Vendor deleted');
      fetchVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Failed to delete', true); }
  };

  // ── Toggle active ───────────────────────────────────────────
  const handleToggle = async (v: ManifestVendor) => {
    try {
      await axios.put(`/manifest-vendors/${v._id}`, { isActive: !v.isActive });
      notify(`${v.name} ${!v.isActive ? 'activated' : 'deactivated'}`);
      fetchVendors();
    } catch { notify('Failed to update status', true); }
  };

  // ── Payout ──────────────────────────────────────────────────
  const handlePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutVendor) return;
    setPayoutBusy(true);
    try {
      await axios.post(`/manifest-vendors/${payoutVendor._id}/payout`, {
        amount: parseFloat(payoutAmt),
        note:   payoutNote,
      });
      notify('Payout recorded');
      setPayoutVendor(null); setPayoutAmt(''); setPayoutNote('');
      fetchVendors();
    } catch (err: any) { notify(err.response?.data?.message || 'Payout failed', true); }
    finally { setPayoutBusy(false); }
  };

  // ── Filtered ────────────────────────────────────────────────
  const filtered = vendors.filter(v =>
    !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalOwed = vendors.reduce((s, v) => s + (v.payableBalance || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} className="animate-fadeIn">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Vendor Management</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Manage API vendors (ShippersHub, Label Crow, ShipLabel) and manifest vendors.</p>
        </div>
        {activeTab === 'manifest' && (
          <button className="btn btn-primary" onClick={() => { setForm(BLANK); setShowCreate(true); }}>
            <PlusIcon style={{ width: 16, height: 16 }} /> Add Vendor
          </button>
        )}
        {activeTab === 'api' && (
          <button className="btn btn-ghost" onClick={handleDiagnose} disabled={diagLoading}
            title="Check live connection to ShippersHub">
            {diagLoading
              ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Checking…</>
              : <><MagnifyingGlassIcon style={{ width: 16, height: 16 }} /> Check Connection</>
            }
          </button>
        )}
      </div>

      {/* Alerts */}
      {(message || error) && (
        <div className={`alert ${message ? 'alert-success' : 'alert-danger'}`} style={{ padding: '0.5rem 0.875rem' }}>
          {message ? <CheckCircleIcon style={{ width: 15, height: 15 }} /> : <ExclamationCircleIcon style={{ width: 15, height: 15 }} />}
          <span style={{ fontSize: '0.82rem' }}>{message || error}</span>
          <button onClick={() => { setMessage(''); setError(''); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}>
            <XMarkIcon style={{ width: 13, height: 13 }} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--navy-100)', paddingBottom: 0 }}>
        {([
          { key: 'api',      label: `API Vendors  ${(apiVendors.length + lcVendors.length + slVendors.length) > 0 ? `· ${apiVendors.length + lcVendors.length + slVendors.length}` : ''}` },
          { key: 'manifest', label: `Manifest Vendors  ${vendors.length > 0 ? `· ${vendors.length}` : ''}` },
        ] as { key: 'api' | 'manifest'; label: string }[]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '0.55rem 1.1rem', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: activeTab === tab.key ? '2px solid var(--accent-600)' : '2px solid transparent',
            color: activeTab === tab.key ? 'var(--accent-700)' : 'var(--navy-500)',
            marginBottom: -2, borderRadius: 0, transition: 'color 0.12s',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── API Vendors Tab ──────────────────────────────────── */}
      {activeTab === 'api' && (() => {
        const PORTALS = [
          {
            id:       'shippershub' as const,
            label:    'ShippersHub',
            count:    apiVendors.length,
            accent:   '#1D4ED8',
            bg:       '#EFF6FF',
            border:   '#BFDBFE',
            syncing:  importing,
            onSync:   handleImportShippersHub,
            syncLabel:'Sync from ShippersHub',
            desc:     'API vendors synced from your ShippersHub account',
          },
          {
            id:       'labelcrow' as const,
            label:    'Label Crow',
            count:    lcVendors.length,
            accent:   '#7C3AED',
            bg:       '#F5F3FF',
            border:   '#DDD6FE',
            syncing:  lcSyncing,
            onSync:   handleSyncLabelCrow,
            syncLabel:'Sync from Label Crow',
            desc:     'USPS vendors · each series × provider key combo',
          },
          {
            id:       'shiplabel' as const,
            label:    'ShipLabel',
            count:    slVendors.length,
            accent:   '#059669',
            bg:       '#ECFDF5',
            border:   '#A7F3D0',
            syncing:  slSyncing,
            onSync:   handleSyncShipLabel,
            syncLabel:'Sync from ShipLabel',
            desc:     'USPS vendors synced from shiplabel.net',
          },
        ];
        const portal = PORTALS.find(p => p.id === activePortal)!;

        return (
          <>
            {/* ── Portal selector card ─────────────────────────── */}
            <div className="sh-card" style={{ padding: 0, overflow: 'hidden' }}>

              {/* Portal pills row */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--navy-100)' }}>
                {PORTALS.map(p => {
                  const active = activePortal === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActivePortal(p.id)}
                      style={{
                        flex: 1, padding: '0.75rem 0.5rem', border: 'none', cursor: 'pointer',
                        background: active ? p.bg : '#fff',
                        borderBottom: active ? `2.5px solid ${p.accent}` : '2.5px solid transparent',
                        transition: 'all 0.12s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      }}
                    >
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: active ? p.accent : 'var(--navy-500)' }}>
                        {p.label}
                      </span>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700,
                        background: active ? p.accent : 'var(--navy-100)',
                        color: active ? '#fff' : 'var(--navy-500)',
                        padding: '1px 8px', borderRadius: 99, transition: 'all 0.12s',
                      }}>
                        {p.count} vendor{p.count !== 1 ? 's' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active portal header: description + sync button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', background: portal.bg, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: portal.accent, fontWeight: 600 }}>{portal.desc}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {activePortal === 'shiplabel' && (
                    <button
                      onClick={openSlCustom}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                        border: `1.5px solid ${portal.accent}`, background: '#fff', color: portal.accent,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <PlusIcon style={{ width: 13, height: 13 }} /> Custom series vendor
                    </button>
                  )}
                  <button
                    onClick={portal.onSync}
                    disabled={portal.syncing}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                      border: `1.5px solid ${portal.accent}`,
                      background: portal.syncing ? portal.bg : portal.accent,
                      color: portal.syncing ? portal.accent : '#fff',
                      cursor: portal.syncing ? 'not-allowed' : 'pointer',
                      opacity: portal.syncing ? 0.75 : 1, transition: 'all 0.15s',
                    }}
                  >
                    {portal.syncing
                      ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2, borderColor: `${portal.accent}40`, borderTopColor: portal.accent }} /> Syncing…</>
                      : <><ArrowPathIcon style={{ width: 13, height: 13 }} /> {portal.syncLabel}</>
                    }
                  </button>
                </div>
              </div>
            </div>

            {/* ── Diagnostics (ShippersHub only) ──────────────── */}
            {activePortal === 'shippershub' && (diagData !== null || diagError) && (
              <div className="sh-card" style={{ padding: '1rem 1.25rem', border: diagError ? '1.5px solid #fca5a5' : '1.5px solid #bbf7d0', background: diagError ? '#fff5f5' : '#f0fdf4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: diagError ? '#b91c1c' : '#15803d' }}>
                    {diagError ? '✗ Connection failed' : `✓ ShippersHub connected — ${diagData!.length} carrier(s) found`}
                  </span>
                  <button onClick={() => { setDiagData(null); setDiagError(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 2 }}>
                    <XMarkIcon style={{ width: 14, height: 14 }} />
                  </button>
                </div>
                {diagError && <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: 0 }}>{diagError}</p>}
                {diagData && diagData.map((carrier: any) => (
                  <div key={carrier._id || carrier.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)', marginBottom: 4 }}>
                      {carrier.name} — Carrier ID: <code style={{ background: '#e0f2fe', padding: '1px 5px', borderRadius: 3, fontSize: '0.75rem' }}>{carrier._id || carrier.id || '?'}</code>
                    </div>
                    {(carrier.vendors || []).length === 0
                      ? <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>No vendors found for this carrier</div>
                      : (carrier.vendors || []).map((v: any) => (
                          <div key={v._id || v.id} style={{ fontSize: '0.72rem', color: 'var(--navy-600)', display: 'flex', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontWeight: 600 }}>{v.name}</span>
                            <span>Vendor ID: <code style={{ background: '#e0f2fe', padding: '1px 4px', borderRadius: 3 }}>{v._id || v.id || '?'}</code></span>
                            <span style={{ color: 'var(--navy-400)' }}>{v.status || ''}</span>
                          </div>
                        ))
                    }
                  </div>
                ))}
                {diagData && diagData.length > 0 && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 8, marginBottom: 0 }}>
                    If the IDs above don't match what's stored in your vendors, click <strong>Sync from ShippersHub</strong> to re-import.
                  </p>
                )}
              </div>
            )}

            {/* ── Vendor table ─────────────────────────────────── */}
            <div className="sh-card">
              {apiLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
              ) : activePortal === 'shippershub' ? (
                apiVendors.length === 0 ? (
                  <div className="empty-state">
                    <CloudArrowDownIcon style={{ width: 40, height: 40, color: '#93C5FD' }} />
                    <h3>No ShippersHub vendors yet</h3>
                    <p>Click <strong>Sync from ShippersHub</strong> above to import your carriers and vendors.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="sh-table">
                      <thead><tr><th>Vendor Name</th><th>Carrier</th><th>Service</th><th>Rate</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {apiVendors.map(v => (
                          <tr key={v._id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy-900)' }}>{v.name}</span>
                                {(!v.shippershubCarrierId || !v.shippershubVendorId) && (
                                  <span title="Missing IDs — re-sync to fix"
                                    style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 5px', fontSize: '0.65rem', fontWeight: 700, cursor: 'help' }}>
                                    ⚠ IDs missing
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 1 }}>
                                C: {v.shippershubCarrierId || <span style={{ color: '#dc2626' }}>—</span>} · V: {v.shippershubVendorId || <span style={{ color: '#dc2626' }}>—</span>}
                              </div>
                            </td>
                            <td>{(() => { const s = CARRIER_STYLES[v.carrier] || { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }; return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{v.carrier}</span>; })()}</td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--navy-600)' }}>{v.shippingService || '—'}</td>
                            <td><span style={{ fontWeight: 700, color: 'var(--success-700)' }}>${v.rate.toFixed(2)}</span></td>
                            <td><span className={v.isActive ? 'badge badge-green' : 'badge badge-red'}>{v.isActive ? 'Active' : 'Inactive'}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 2 }}>
                                <button onClick={() => openEditApi(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1D4ED8', padding: 5, borderRadius: 4 }}><PencilIcon style={{ width: 14, height: 14 }} /></button>
                                <button onClick={() => handleDeleteApi(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 5, borderRadius: 4 }}><TrashIcon style={{ width: 14, height: 14 }} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : activePortal === 'labelcrow' ? (
                lcVendors.length === 0 ? (
                  <div className="empty-state">
                    <CloudArrowDownIcon style={{ width: 40, height: 40, color: '#C4B5FD' }} />
                    <h3>No Label Crow vendors yet</h3>
                    <p>Click <strong>Sync from Label Crow</strong> above to import all series × provider combinations.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="sh-table">
                      <thead><tr><th>Vendor Name</th><th>Series ID</th><th>Service</th><th>Provider Key</th><th>Rate</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {lcVendors.map(v => (
                          <tr key={v._id}>
                            <td><span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy-900)' }}>{v.name}</span></td>
                            <td><code style={{ background: '#ede9fe', color: '#5b21b6', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>{v.labelcrowSeriesId ?? '—'}</code></td>
                            <td>
                              <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: v.labelcrowServiceClass === 'priority' ? '#e8f0fe' : '#f0fdf4', color: v.labelcrowServiceClass === 'priority' ? '#1a56db' : '#15803d', border: `1px solid ${v.labelcrowServiceClass === 'priority' ? '#bfdbfe' : '#bbf7d0'}` }}>
                                {v.labelcrowServiceClass ? v.labelcrowServiceClass.charAt(0).toUpperCase() + v.labelcrowServiceClass.slice(1) : '—'}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--navy-600)' }}>{v.labelcrowProviderKey || <span style={{ color: 'var(--navy-300)' }}>—</span>}</td>
                            <td><span style={{ fontWeight: 700, color: 'var(--success-700)' }}>${v.rate.toFixed(2)}</span></td>
                            <td><span className={v.isActive ? 'badge badge-green' : 'badge badge-red'}>{v.isActive ? 'Active' : 'Inactive'}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 2 }}>
                                <button onClick={() => openEditApi(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7C3AED', padding: 5, borderRadius: 4 }}><PencilIcon style={{ width: 14, height: 14 }} /></button>
                                <button onClick={() => handleDeleteApi(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 5, borderRadius: 4 }}><TrashIcon style={{ width: 14, height: 14 }} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                slVendors.length === 0 ? (
                  <div className="empty-state">
                    <CloudArrowDownIcon style={{ width: 40, height: 40, color: '#6EE7B7' }} />
                    <h3>No ShipLabel vendors yet</h3>
                    <p>Click <strong>Sync from ShipLabel</strong> above to import all services from your account.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="sh-table">
                      <thead><tr><th>Vendor Name</th><th>Service ID</th><th>Series</th><th>Format</th><th>Rate</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {slVendors.map(v => (
                          <tr key={v._id}>
                            <td><span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy-900)' }}>{v.name}</span></td>
                            <td><code style={{ background: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>{v.shiplabelServiceId ?? '—'}</code></td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--navy-600)' }}>{v.shiplabelLabelSeries || <span style={{ color: 'var(--navy-300)' }}>—</span>}</td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--navy-600)' }}>{v.shiplabelLabelFormat ? slFormatLabel(v.shiplabelLabelFormat) : <span style={{ color: 'var(--navy-300)' }}>—</span>}</td>
                            <td><span style={{ fontWeight: 700, color: 'var(--success-700)' }}>${v.rate.toFixed(2)}</span></td>
                            <td><span className={v.isActive ? 'badge badge-green' : 'badge badge-red'}>{v.isActive ? 'Active' : 'Inactive'}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 2 }}>
                                <button onClick={() => openEditApi(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#059669', padding: 5, borderRadius: 4 }}><PencilIcon style={{ width: 14, height: 14 }} /></button>
                                <button onClick={() => handleDeleteApi(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 5, borderRadius: 4 }}><TrashIcon style={{ width: 14, height: 14 }} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Edit API vendor modal */}
            {editApi && (
              <Modal title={`Edit — ${editApi.name}`} onClose={() => setEditApi(null)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ padding: '0.75rem 1rem', background: 'var(--navy-25)', borderRadius: 8, border: '1px solid var(--navy-100)', fontSize: '0.82rem', color: 'var(--navy-600)' }}>
                    <strong>{editApi.carrier}</strong>{editApi.shippingService ? ` · ${editApi.shippingService}` : ''} &mdash;{' '}
                    {editApi.source === 'labelcrow' ? 'Label Crow vendor' : editApi.source === 'shiplabel' ? 'ShipLabel vendor' : 'ShippersHub vendor'}
                  </div>
                  <div>
                    <label className="form-label">Rate per Label ($)</label>
                    <input className="form-input" type="number" step="0.01" min="0"
                      value={apiRate} onChange={e => setApiRate(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" id="apiActive" checked={apiActive}
                      onChange={e => setApiActive(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent-600)' }} />
                    <label htmlFor="apiActive" style={{ fontSize: '0.875rem', color: 'var(--navy-700)', cursor: 'pointer' }}>
                      Active (users can generate labels with this vendor)
                    </label>
                  </div>

                  {editApi.source === 'shiplabel' && (
                    <div>
                      <label className="form-label">Series &amp; Formats</label>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--navy-400)' }}>
                        Each row is a selectable option users pick at label generation. Leave empty to use the vendor's
                        built-in series. Series is the printed prefix (e.g. <code>9505</code>).
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                        {apiSeries.length === 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--navy-300)', padding: '0.25rem 0' }}>No series configured.</div>
                        )}
                        {apiSeries.map((row, i) => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr 28px', gap: 6, alignItems: 'center' }}>
                            <select className="form-input" value={row.series}
                              onChange={e => updateSeriesRow(i, { series: e.target.value })} style={{ fontSize: '0.8rem' }}>
                              {!SL_SERIES.some(s => s.value === row.series) && row.series && <option value={row.series}>{row.series}</option>}
                              {SL_SERIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <select className="form-input" value={row.format}
                              onChange={e => updateSeriesRow(i, { format: e.target.value })} style={{ fontSize: '0.8rem' }}>
                              {!SL_FORMATS.some(f => f.value === row.format) && row.format && <option value={row.format}>{row.format}</option>}
                              {SL_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            <input className="form-input" placeholder="Label (optional)" value={row.name}
                              onChange={e => updateSeriesRow(i, { name: e.target.value })} style={{ fontSize: '0.8rem' }} />
                            <button type="button" onClick={() => removeSeriesRow(i)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 2 }}
                              aria-label="Remove series">
                              <TrashIcon style={{ width: 16, height: 16 }} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-ghost" onClick={addSeriesRow}
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                          <PlusIcon style={{ width: 14, height: 14, marginRight: 4 }} /> Add series
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem' }}>
                  <button className="btn btn-ghost" onClick={() => setEditApi(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveApi} disabled={apiSaving}>
                    {apiSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </Modal>
            )}

            {/* New custom ShipLabel series vendor modal */}
            {slCustomOpen && (() => {
              const comboCount = slPickSeries.length * slPickFormats.length;
              const box: React.CSSProperties = {
                height: 190, overflowY: 'auto', border: '1px solid var(--navy-200)',
                borderRadius: 8, padding: '0.35rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 2,
              };
              const rowStyle: React.CSSProperties = {
                display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem',
                color: 'var(--navy-700)', cursor: 'pointer', padding: '2px 0',
              };
              return (
              <Modal title="New custom series vendors" onClose={() => setSlCustomOpen(false)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--navy-500)' }}>
                    Pick series and formats — the same lists as the ShipLabel portal. One standalone
                    vendor is created per <strong>series × format</strong> pair (off the "Custom Label
                    (Series &amp; Format)" service). Each shows in the vendor list and can be granted to
                    users. Pairs that already exist are skipped.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label className="form-label">Series ({slPickSeries.length})</label>
                      <div style={box}>
                        {SL_SERIES.map(s => (
                          <label key={s.value} style={rowStyle}>
                            <input type="checkbox" checked={slPickSeries.includes(s.value)}
                              onChange={() => toggleSlSeries(s.value)}
                              style={{ accentColor: 'var(--accent-600)' }} />
                            {s.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Formats ({slPickFormats.length})</label>
                      <div style={box}>
                        {SL_FORMATS.map(f => (
                          <label key={f.value} style={rowStyle}>
                            <input type="checkbox" checked={slPickFormats.includes(f.value)}
                              onChange={() => toggleSlFormat(f.value)}
                              style={{ accentColor: 'var(--accent-600)' }} />
                            {f.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Rate per Label ($)</label>
                    <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00"
                      value={slCustomRate}
                      onChange={e => setSlCustomRate(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: '1.5rem' }}>
                  <span style={{ marginRight: 'auto', fontSize: '0.78rem', color: 'var(--navy-400)' }}>
                    {comboCount} vendor{comboCount !== 1 ? 's' : ''} will be created
                  </span>
                  <button className="btn btn-ghost" onClick={() => setSlCustomOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleCreateCustomSlVendor}
                    disabled={slCustomSaving || comboCount === 0}>
                    {slCustomSaving ? 'Creating…' : `Create ${comboCount || ''} vendor${comboCount !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </Modal>
              );
            })()}
          </>
        );
      })()}

      {/* ── Manifest Vendors Tab ─────────────────────────────── */}
      {activeTab === 'manifest' && (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total Vendors',   value: vendors.length,                              color: 'var(--navy-900)' },
          { label: 'Active',          value: vendors.filter(v => v.isActive).length,       color: 'var(--success-600)' },
          { label: 'Total Labels',    value: vendors.reduce((s,v)=>s+(v.stats?.totalLabels||0),0).toLocaleString(), color: 'var(--accent-600)' },
          { label: 'Total Owed',      value: `$${totalOwed.toFixed(2)}`,                  color: totalOwed > 0 ? 'var(--warning-600)' : 'var(--navy-400)' },
        ].map(s => (
          <div key={s.label} className="sh-card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="sh-card" style={{ padding: '0.75rem 1rem' }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <MagnifyingGlassIcon style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: 'var(--navy-400)', pointerEvents: 'none' }} />
          <input className="form-input" style={{ paddingLeft: '2.1rem', fontSize: '0.82rem' }}
            placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="sh-card">
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <UserGroupIcon style={{ width: 40, height: 40 }} />
            <h3>No vendors yet</h3>
            <p>Add your first manifest vendor (Arslan, Mujtaba, etc.) to get started.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Carriers</th>
                  <th>Score</th>
                  <th>KPIs</th>
                  <th>Vendor Rate</th>
                  <th>Payable Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v._id}>

                    {/* Name + email */}
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.875rem' }}>{v.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)' }}>{v.email}</div>
                      {v.description && <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 2 }}>{v.description}</div>}
                    </td>

                    {/* Carrier badges */}
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(v.carriers || []).map(c => {
                          const s = CARRIER_STYLES[c] || { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
                          return (
                            <span key={c} style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700,
                              background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                            }}>{c}</span>
                          );
                        })}
                      </div>
                    </td>

                    {/* Star score */}
                    <td><StarRating score={v.score} /></td>

                    {/* KPIs */}
                    <td>
                      <div style={{ fontSize: '0.72rem', color: 'var(--navy-600)', lineHeight: 1.6 }}>
                        <div>{v.stats?.completedJobs || 0} completed</div>
                        <div style={{ color: 'var(--navy-400)' }}>{v.stats?.totalLabels || 0} labels</div>
                      </div>
                    </td>

                    {/* Vendor rate */}
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--success-700)' }}>
                        ${(v.vendorRate || 0).toFixed(2)}<span style={{ fontWeight: 400, fontSize: '0.68rem', color: 'var(--navy-400)' }}>/label</span>
                      </div>
                    </td>

                    {/* Payable balance + payout button */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          fontWeight: 700, fontSize: '0.875rem',
                          color: (v.payableBalance || 0) > 0 ? 'var(--warning-700)' : 'var(--navy-400)',
                        }}>
                          ${(v.payableBalance || 0).toFixed(2)}
                        </div>
                        {(v.payableBalance || 0) > 0 && (
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                            onClick={() => { setPayoutVendor(v); setPayoutAmt(v.payableBalance.toFixed(2)); setPayoutNote(''); }}
                          >
                            <BanknotesIcon style={{ width: 11, height: 11 }} /> Pay
                          </button>
                        )}
                      </div>
                      {v.totalPaidOut > 0 && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', marginTop: 2 }}>
                          ${(v.totalPaidOut).toFixed(2)} paid total
                        </div>
                      )}
                    </td>

                    {/* Status badge */}
                    <td>
                      <span className={v.isActive ? 'badge badge-green' : 'badge badge-red'}>
                        {v.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button title="Edit" onClick={() => openEdit(v)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-600)', padding: 5, borderRadius: 4 }}>
                          <PencilIcon style={{ width: 15, height: 15 }} />
                        </button>
                        <button title={v.isActive ? 'Deactivate' : 'Activate'} onClick={() => handleToggle(v)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: v.isActive ? 'var(--warning-600)' : 'var(--success-600)', padding: 5, borderRadius: 4 }}>
                          <ArrowPathIcon style={{ width: 15, height: 15 }} />
                        </button>
                        <button title="Delete" onClick={() => handleDelete(v)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 5, borderRadius: 4 }}>
                          <TrashIcon style={{ width: 15, height: 15 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

          {/* Create modal */}
          {showCreate && (
            <Modal title="Add Manifest Vendor" onClose={() => setShowCreate(false)}>
              <form onSubmit={handleCreate}>
                <VendorForm form={form} setForm={setForm} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                    {isSubmitting ? 'Creating…' : 'Create Vendor'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {/* Edit modal */}
          {editVendor && (
            <Modal title={`Edit — ${editVendor.name}`} onClose={() => { setEditVendor(null); setForm(BLANK); }}>
              <form onSubmit={handleEdit}>
                <VendorForm form={form} setForm={setForm} isEdit />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => { setEditVendor(null); setForm(BLANK); }}>Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="btn btn-primary">
                    {isSubmitting ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {/* Payout modal */}
          {payoutVendor && (
            <Modal title={`Pay Out — ${payoutVendor.name}`} onClose={() => setPayoutVendor(null)}>
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--navy-25)', borderRadius: 8, border: '1px solid var(--navy-100)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)', marginBottom: 4 }}>Payable Balance</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--warning-700)' }}>
                  ${(payoutVendor.payableBalance || 0).toFixed(2)}
                </div>
              </div>
              <form onSubmit={handlePayout}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <label className="form-label">Amount ($) *</label>
                    <input className="form-input" type="number" step="0.01" min="0.01"
                      max={payoutVendor.payableBalance} required
                      value={payoutAmt} onChange={e => setPayoutAmt(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Note</label>
                    <input className="form-input" value={payoutNote}
                      onChange={e => setPayoutNote(e.target.value)} placeholder="Bank transfer, etc." />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setPayoutVendor(null)}>Cancel</button>
                  <button type="submit" disabled={payoutBusy} className="btn btn-success">
                    <BanknotesIcon style={{ width: 15, height: 15 }} />
                    {payoutBusy ? 'Processing…' : 'Mark as Paid'}
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}
    </div>
  );
};

export default VendorManagement;
