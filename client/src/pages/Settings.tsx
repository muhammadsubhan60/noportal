import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  PencilIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

interface Account {
  _id: string;
  name: string;
  email: string;
  isActive: boolean;
  testedAt: string | null;
  testStatus: 'success' | 'failed' | null;
  createdAt: string;
}

interface ModalState {
  open: boolean;
  mode: 'add' | 'edit';
  account: Account | null;
}

interface ApiCredentialStatus {
  provider: 'shiplabel' | 'labelcrow';
  configured: boolean;
  source: 'database' | 'env' | 'none';
  last4: string | null;
  testedAt: string | null;
  testStatus: 'success' | 'failed' | null;
}

const API_KEY_PROVIDERS: { id: 'shiplabel' | 'labelcrow'; title: string; envVar: string }[] = [
  { id: 'shiplabel', title: 'ShipLabel.net', envVar: 'SHIPLABEL_API_KEY' },
  { id: 'labelcrow', title: 'Label Crow',    envVar: 'LABELCROW_API_KEY' },
];

const emptyForm = { name: '', email: '', password: '' };

export default function Settings() {
  const { token } = useAuth();
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState<ModalState>({ open: false, mode: 'add', account: null });
  const [form, setForm]           = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState<string | null>(null); // account _id being tested
  const [activating, setActivating] = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [testMsg, setTestMsg]     = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [actionMsg, setActionMsg] = useState('');

  // ── API key (ShipLabel / Label Crow) state ──────────────────────────────────
  const [apiCredentials, setApiCredentials] = useState<ApiCredentialStatus[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [keyModal, setKeyModal]   = useState<{ open: boolean; provider: 'shiplabel' | 'labelcrow' | null }>({ open: false, provider: null });
  const [keyForm, setKeyForm]     = useState('');
  const [keyFormError, setKeyFormError] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey]   = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [keyTestMsg, setKeyTestMsg]   = useState<{ provider: string; ok: boolean; msg: string } | null>(null);

  const authHeader = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/shippershub-accounts`, { headers: authHeader() });
      setAccounts(res.data.accounts || []);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const fetchApiCredentials = useCallback(async () => {
    setApiKeysLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api-credentials`, { headers: authHeader() });
      setApiCredentials(res.data.credentials || []);
    } catch {
      setApiCredentials([]);
    } finally {
      setApiKeysLoading(false);
    }
  }, [authHeader]);

  useEffect(() => { fetchApiCredentials(); }, [fetchApiCredentials]);

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(emptyForm);
    setFormError('');
    setModal({ open: true, mode: 'add', account: null });
  };

  const openEdit = (acc: Account) => {
    setForm({ name: acc.name, email: acc.email, password: '' });
    setFormError('');
    setModal({ open: true, mode: 'edit', account: acc });
  };

  const closeModal = () => setModal({ open: false, mode: 'add', account: null });

  // ── Save (create or update) ───────────────────────────────────────────────
  const handleSave = async () => {
    setFormError('');
    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    if (modal.mode === 'add' && !form.password) {
      setFormError('Password is required for new accounts.');
      return;
    }

    setSaving(true);
    try {
      if (modal.mode === 'add') {
        await axios.post(`${API_BASE}/shippershub-accounts`, form, { headers: authHeader() });
        setActionMsg('Account added successfully.');
      } else {
        const payload: Record<string, string> = { name: form.name, email: form.email };
        if (form.password) payload.password = form.password;
        await axios.put(`${API_BASE}/shippershub-accounts/${modal.account!._id}`, payload, { headers: authHeader() });
        setActionMsg('Account updated.');
      }
      closeModal();
      fetchAccounts();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  // ── Test connection ───────────────────────────────────────────────────────
  const handleTest = async (acc: Account) => {
    setTesting(acc._id);
    setTestMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/shippershub-accounts/${acc._id}/test`, {}, { headers: authHeader() });
      setTestMsg({ id: acc._id, ok: true, msg: res.data.message || 'Connection successful' });
      fetchAccounts();
    } catch (err: any) {
      setTestMsg({ id: acc._id, ok: false, msg: err.response?.data?.message || 'Connection failed' });
      fetchAccounts();
    } finally {
      setTesting(null);
    }
  };

  // ── Activate ──────────────────────────────────────────────────────────────
  const handleActivate = async (acc: Account) => {
    setActivating(acc._id);
    setActionMsg('');
    try {
      const res = await axios.post(`${API_BASE}/shippershub-accounts/${acc._id}/activate`, {}, { headers: authHeader() });
      setActionMsg(res.data.message || 'Account activated.');
      fetchAccounts();
    } catch (err: any) {
      setActionMsg(err.response?.data?.message || 'Failed to activate.');
    } finally {
      setActivating(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (acc: Account) => {
    if (!window.confirm(`Delete "${acc.name}"? This cannot be undone.`)) return;
    setDeleting(acc._id);
    setActionMsg('');
    try {
      await axios.delete(`${API_BASE}/shippershub-accounts/${acc._id}`, { headers: authHeader() });
      setActionMsg('Account deleted.');
      fetchAccounts();
    } catch (err: any) {
      setActionMsg(err.response?.data?.message || 'Failed to delete.');
    } finally {
      setDeleting(null);
    }
  };

  // ── API key modal helpers ────────────────────────────────────────────────
  const openKeyModal = (provider: 'shiplabel' | 'labelcrow') => {
    setKeyForm('');
    setKeyFormError('');
    setKeyModal({ open: true, provider });
  };

  const closeKeyModal = () => setKeyModal({ open: false, provider: null });

  const handleSaveKey = async () => {
    if (!keyModal.provider) return;
    setKeyFormError('');
    if (!keyForm.trim()) {
      setKeyFormError('API key is required.');
      return;
    }

    setSavingKey(true);
    try {
      await axios.put(
        `${API_BASE}/api-credentials/${keyModal.provider}`,
        { apiKey: keyForm.trim() },
        { headers: authHeader() }
      );
      setActionMsg('API key saved.');
      closeKeyModal();
      fetchApiCredentials();
    } catch (err: any) {
      setKeyFormError(err.response?.data?.message || 'Failed to save API key.');
    } finally {
      setSavingKey(false);
    }
  };

  const handleTestApiKey = async (provider: string) => {
    setTestingKey(provider);
    setKeyTestMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/api-credentials/${provider}/test`, {}, { headers: authHeader() });
      setKeyTestMsg({ provider, ok: true, msg: res.data.message || 'Connection successful' });
    } catch (err: any) {
      setKeyTestMsg({ provider, ok: false, msg: err.response?.data?.message || 'Connection failed' });
    } finally {
      setTestingKey(null);
      fetchApiCredentials();
    }
  };

  const handleRemoveApiKey = async (provider: string) => {
    if (!window.confirm('Remove this API key? Label generation for this provider will fail unless an environment variable fallback is set.')) return;
    setRemovingKey(provider);
    try {
      await axios.delete(`${API_BASE}/api-credentials/${provider}`, { headers: authHeader() });
      setActionMsg('API key removed.');
      fetchApiCredentials();
    } catch (err: any) {
      setActionMsg(err.response?.data?.message || 'Failed to remove API key.');
    } finally {
      setRemovingKey(null);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 14,
    border: '1.5px solid var(--navy-100, #e8edf5)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
    overflow: 'hidden',
  };

  const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'var(--accent-600, #4f46e5)', color: '#fff',
    fontSize: '0.82rem', fontWeight: 700,
  };

  const btnGhost: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', borderRadius: 7,
    border: '1.5px solid var(--navy-150, #e2e8f0)', background: '#fff',
    color: 'var(--navy-600, #475569)', fontSize: '0.78rem', fontWeight: 600,
    cursor: 'pointer',
  };

  const btnDanger: React.CSSProperties = {
    ...btnGhost,
    color: '#DC2626', borderColor: '#FCA5A5', background: '#FFF5F5',
  };

  const btnSuccess: React.CSSProperties = {
    ...btnGhost,
    color: '#059669', borderColor: '#6EE7B7', background: '#F0FDF4',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid var(--navy-150, #e2e8f0)',
    fontSize: '0.85rem', color: 'var(--navy-800)', outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 700,
    color: 'var(--navy-500)', marginBottom: 5, letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0 }}>Settings</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', marginTop: 4 }}>Manage platform integrations and configuration</p>
        </div>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div style={{
          padding: '10px 16px', borderRadius: 9, marginBottom: 16,
          background: '#F0FDF4', border: '1.5px solid #6EE7B7',
          color: '#065F46', fontSize: '0.82rem', fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {actionMsg}
          <button onClick={() => setActionMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065F46', fontSize: '1rem', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── ShippersHub Accounts card ──────────────────────────────────────── */}
      <div style={card}>

        {/* Card header */}
        <div style={{
          padding: '1.1rem 1.4rem',
          borderBottom: '1px solid var(--navy-100, #e8edf5)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-900)' }}>ShippersHub Accounts</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 2 }}>
              The <strong>active</strong> account is used for all label generation. Only one can be active at a time.
            </div>
          </div>
          <button style={btnPrimary} onClick={openAdd}>
            <PlusIcon style={{ width: 15, height: 15 }} />
            Add Account
          </button>
        </div>

        {/* Important notice */}
        <div style={{
          margin: '0.9rem 1.4rem',
          padding: '10px 14px',
          borderRadius: 9,
          background: '#FFFBEB',
          border: '1.5px solid #FDE68A',
          color: '#92400E',
          fontSize: '0.78rem',
          lineHeight: 1.6,
        }}>
          <strong>Important:</strong> Each ShippersHub account has its own set of carriers and vendor IDs.
          After switching the active account, go to <strong>Vendors → Import from ShippersHub</strong> to re-sync
          carriers and vendors for the new account — otherwise label generation will fail.
        </div>

        {/* Account list */}
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--navy-300)', fontSize: '0.85rem' }}>
            Loading…
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--navy-400)' }}>No accounts configured yet.</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--navy-300)', marginTop: 4 }}>
              Add an account above, or set <code>SHIPPERSHUB_EMAIL</code> / <code>SHIPPERSHUB_PASSWORD</code> in <code>.env</code> as a fallback.
            </div>
          </div>
        ) : (
          <div>
            {accounts.map((acc, i) => {
              const isTestingThis   = testing === acc._id;
              const isActivatingThis = activating === acc._id;
              const isDeletingThis  = deleting === acc._id;
              const myTestMsg       = testMsg?.id === acc._id ? testMsg : null;

              return (
                <div
                  key={acc._id}
                  style={{
                    padding: '1rem 1.4rem',
                    borderBottom: i < accounts.length - 1 ? '1px solid var(--navy-50, #f8fafc)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 16,
                    background: acc.isActive ? 'rgba(5,150,105,0.03)' : '#fff',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Active indicator */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: acc.isActive ? '#059669' : 'var(--navy-200, #cbd5e1)',
                    boxShadow: acc.isActive ? '0 0 0 3px rgba(5,150,105,0.18)' : 'none',
                  }} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--navy-800)' }}>{acc.name}</span>
                      {acc.isActive && (
                        <span style={{
                          fontSize: '0.63rem', fontWeight: 800, letterSpacing: '0.06em',
                          padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase',
                          background: 'rgba(5,150,105,0.12)', color: '#059669',
                          border: '1px solid rgba(5,150,105,0.25)',
                        }}>ACTIVE</span>
                      )}
                      {acc.testStatus === 'success' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                          <CheckCircleIcon style={{ width: 13, height: 13 }} /> Verified
                        </span>
                      )}
                      {acc.testStatus === 'failed' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: '#DC2626', fontWeight: 600 }}>
                          <XCircleIcon style={{ width: 13, height: 13 }} /> Failed
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 2 }}>{acc.email}</div>
                    {acc.testedAt && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-300)', marginTop: 1 }}>
                        Last tested: {new Date(acc.testedAt).toLocaleString()}
                      </div>
                    )}
                    {/* Inline test result */}
                    {myTestMsg && (
                      <div style={{
                        marginTop: 6, padding: '5px 10px', borderRadius: 7, display: 'inline-flex',
                        alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600,
                        background: myTestMsg.ok ? '#F0FDF4' : '#FFF5F5',
                        color: myTestMsg.ok ? '#059669' : '#DC2626',
                        border: `1px solid ${myTestMsg.ok ? '#6EE7B7' : '#FCA5A5'}`,
                      }}>
                        {myTestMsg.ok
                          ? <CheckCircleIcon style={{ width: 13, height: 13 }} />
                          : <XCircleIcon style={{ width: 13, height: 13 }} />
                        }
                        {myTestMsg.msg}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {/* Test */}
                    <button
                      style={btnGhost}
                      onClick={() => handleTest(acc)}
                      disabled={isTestingThis}
                      title="Test connection"
                    >
                      <ArrowPathIcon style={{ width: 13, height: 13, animation: isTestingThis ? 'spin 1s linear infinite' : 'none' }} />
                      {isTestingThis ? 'Testing…' : 'Test'}
                    </button>

                    {/* Edit */}
                    <button style={btnGhost} onClick={() => openEdit(acc)} title="Edit">
                      <PencilIcon style={{ width: 13, height: 13 }} />
                      Edit
                    </button>

                    {/* Activate */}
                    {!acc.isActive && (
                      <button
                        style={btnSuccess}
                        onClick={() => handleActivate(acc)}
                        disabled={isActivatingThis}
                        title="Set as active"
                      >
                        <CheckCircleIcon style={{ width: 13, height: 13 }} />
                        {isActivatingThis ? 'Activating…' : 'Activate'}
                      </button>
                    )}

                    {/* Delete */}
                    {!acc.isActive && (
                      <button
                        style={btnDanger}
                        onClick={() => handleDelete(acc)}
                        disabled={isDeletingThis}
                        title="Delete"
                      >
                        <TrashIcon style={{ width: 13, height: 13 }} />
                        {isDeletingThis ? '…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ShipLabel / Label Crow API Keys card ───────────────────────────── */}
      <div style={{ ...card, marginTop: 24 }}>

        <div style={{
          padding: '1.1rem 1.4rem',
          borderBottom: '1px solid var(--navy-100, #e8edf5)',
        }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-900)' }}>Label Provider API Keys</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 2 }}>
            Add or update keys here instead of editing environment variables. Stored keys are encrypted at rest.
          </div>
        </div>

        {apiKeysLoading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--navy-300)', fontSize: '0.85rem' }}>
            Loading…
          </div>
        ) : (
          <div>
            {API_KEY_PROVIDERS.map((p, i) => {
              const status         = apiCredentials.find(c => c.provider === p.id) || null;
              const isTestingThis  = testingKey === p.id;
              const isRemovingThis = removingKey === p.id;
              const myTestMsg      = keyTestMsg?.provider === p.id ? keyTestMsg : null;
              const configured     = !!status?.configured;
              const inDb           = status?.source === 'database';

              return (
                <div
                  key={p.id}
                  style={{
                    padding: '1rem 1.4rem',
                    borderBottom: i < API_KEY_PROVIDERS.length - 1 ? '1px solid var(--navy-50, #f8fafc)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}
                >
                  {/* Configured indicator */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: configured ? '#059669' : 'var(--navy-200, #cbd5e1)',
                    boxShadow: configured ? '0 0 0 3px rgba(5,150,105,0.18)' : 'none',
                  }} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--navy-800)' }}>{p.title}</span>
                      {status?.testStatus === 'success' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                          <CheckCircleIcon style={{ width: 13, height: 13 }} /> Verified
                        </span>
                      )}
                      {status?.testStatus === 'failed' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: '#DC2626', fontWeight: 600 }}>
                          <XCircleIcon style={{ width: 13, height: 13 }} /> Failed
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 2 }}>
                      {inDb
                        ? `Key ending in •••• ${status?.last4}`
                        : status?.source === 'env'
                          ? <>Using <code>{p.envVar}</code> from environment variables</>
                          : 'Not configured'}
                    </div>
                    {status?.testedAt && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--navy-300)', marginTop: 1 }}>
                        Last tested: {new Date(status.testedAt).toLocaleString()}
                      </div>
                    )}
                    {myTestMsg && (
                      <div style={{
                        marginTop: 6, padding: '5px 10px', borderRadius: 7, display: 'inline-flex',
                        alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600,
                        background: myTestMsg.ok ? '#F0FDF4' : '#FFF5F5',
                        color: myTestMsg.ok ? '#059669' : '#DC2626',
                        border: `1px solid ${myTestMsg.ok ? '#6EE7B7' : '#FCA5A5'}`,
                      }}>
                        {myTestMsg.ok
                          ? <CheckCircleIcon style={{ width: 13, height: 13 }} />
                          : <XCircleIcon style={{ width: 13, height: 13 }} />
                        }
                        {myTestMsg.msg}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      style={btnGhost}
                      onClick={() => handleTestApiKey(p.id)}
                      disabled={isTestingThis || !configured}
                      title="Test connection"
                    >
                      <ArrowPathIcon style={{ width: 13, height: 13, animation: isTestingThis ? 'spin 1s linear infinite' : 'none' }} />
                      {isTestingThis ? 'Testing…' : 'Test'}
                    </button>

                    <button style={btnGhost} onClick={() => openKeyModal(p.id)} title={inDb ? 'Replace key' : 'Add key'}>
                      <PencilIcon style={{ width: 13, height: 13 }} />
                      {inDb ? 'Replace' : 'Add Key'}
                    </button>

                    {inDb && (
                      <button
                        style={btnDanger}
                        onClick={() => handleRemoveApiKey(p.id)}
                        disabled={isRemovingThis}
                        title="Remove"
                      >
                        <TrashIcon style={{ width: 13, height: 13 }} />
                        {isRemovingThis ? '…' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      {modal.open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            padding: '1.6rem',
          }}>
            {/* Modal header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                {modal.mode === 'add' ? 'Add ShippersHub Account' : 'Edit Account'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', marginTop: 3 }}>
                {modal.mode === 'add'
                  ? 'Credentials are encrypted before storage. Use Test after saving to verify.'
                  : 'Leave password blank to keep the existing password.'}
              </div>
            </div>

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Account Name</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. Main Account"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>ShippersHub Email</label>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  Password {modal.mode === 'edit' && <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--navy-300)' }}>(leave blank to keep current)</span>}
                </label>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder={modal.mode === 'edit' ? '••••••••' : 'ShippersHub password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>

              {formError && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8, background: '#FFF5F5',
                  border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '0.78rem', fontWeight: 600,
                }}>
                  {formError}
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={closeModal} disabled={saving}>Cancel</button>
              <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : modal.mode === 'add' ? 'Add Account' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── API Key Modal ─────────────────────────────────────────────────── */}
      {keyModal.open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) closeKeyModal(); }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            padding: '1.6rem',
          }}>
            {/* Modal header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                {API_KEY_PROVIDERS.find(p => p.id === keyModal.provider)?.title} API Key
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--navy-400)', marginTop: 3 }}>
                The key is encrypted before storage. Use Test after saving to verify it works.
              </div>
            </div>

            {/* Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>API Key</label>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder="Paste API key here"
                  value={keyForm}
                  onChange={e => setKeyForm(e.target.value)}
                  autoFocus
                />
              </div>

              {keyFormError && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8, background: '#FFF5F5',
                  border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '0.78rem', fontWeight: 600,
                }}>
                  {keyFormError}
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={closeKeyModal} disabled={savingKey}>Cancel</button>
              <button style={btnPrimary} onClick={handleSaveKey} disabled={savingKey}>
                {savingKey ? 'Saving…' : 'Save Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
