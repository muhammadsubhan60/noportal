import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  KeyIcon, EyeIcon, EyeSlashIcon,
  CheckCircleIcon, ExclamationCircleIcon,
  BellIcon, BellSlashIcon, PencilIcon,
  FunnelIcon, UserCircleIcon, ShieldCheckIcon,
  CurrencyDollarIcon, ClockIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const DEFAULT_PORTAL_NAMES: Record<'shippershub' | 'labelcrow' | 'shiplabel', string> = {
  shippershub: 'Standard', labelcrow: 'Express', shiplabel: 'Priority',
};

type TxType = 'topup' | 'deduction' | 'adjustment';

interface Txn {
  _id?: string;
  type: TxType;
  amount: number;
  description?: string;
  createdAt: string;
}

interface PaymentLog {
  _id: string;
  amount: number;
  date: string;
  note?: string;
  screenshots?: string[];
  wallet?: { _id: string; name: string } | null;
}

const SLabel = ({ text, accent = 'var(--accent-500)' }: { text: string; accent?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <div style={{ width: 3, height: 12, borderRadius: 3, background: accent, flexShrink: 0 }} />
    <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: FONT }}>
      {text}
    </span>
  </div>
);

// Divider between rows inside a merged card
const RowDivider = () => (
  <div style={{ height: 1, background: 'var(--navy-100)', margin: '0 1.1rem' }} />
);

const Profile: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [isEditing,          setIsEditing]          = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [notifSaving,        setNotifSaving]        = useState(false);
  const [notifMsg,           setNotifMsg]           = useState('');
  const [showCurrentPw,      setShowCurrentPw]      = useState(false);
  const [showNewPw,          setShowNewPw]          = useState(false);
  const [showConfirmPw,      setShowConfirmPw]      = useState(false);
  const [isLoading,          setIsLoading]          = useState(false);
  const [message,            setMessage]            = useState('');
  const [error,              setError]              = useState('');

  const [transactions,  setTransactions]  = useState<Txn[]>([]);
  const [txFilter,      setTxFilter]      = useState<'all' | TxType>('all');
  const [txLoading,     setTxLoading]     = useState(true);
  const [txError,       setTxError]       = useState('');

  const [payments,      setPayments]      = useState<PaymentLog[]>([]);
  const [totalPaid,     setTotalPaid]     = useState(0);
  const [payLoading,    setPayLoading]    = useState(true);
  const [payError,      setPayError]      = useState('');

  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName:  user?.lastName  || '',
    email:     user?.email     || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
  });

  // Reseller white-label portal names — shown to this reseller's own client users
  // instead of the raw backend provider name (ShippersHub / Label Crow / ShipLabel).
  const [portalLabelForm, setPortalLabelForm] = useState({
    shippershub: user?.portalLabels?.shippershub || '',
    labelcrow:   user?.portalLabels?.labelcrow   || '',
    shiplabel:   user?.portalLabels?.shiplabel   || '',
  });
  const [portalLabelSaving, setPortalLabelSaving] = useState(false);
  const [portalLabelMsg,    setPortalLabelMsg]    = useState('');

  const handleSavePortalLabels = async () => {
    setPortalLabelSaving(true); setPortalLabelMsg('');
    try {
      const res = await axios.put(`/users/${user?.id}`, { portalLabels: portalLabelForm });
      updateUser(res.data.user);
      setPortalLabelMsg('Saved.');
      setTimeout(() => setPortalLabelMsg(''), 2000);
    } catch (err: any) {
      setPortalLabelMsg(err.response?.data?.message || 'Failed to save.');
    } finally { setPortalLabelSaving(false); }
  };

  useEffect(() => {
    axios.get('/balance/transactions?limit=100')
      .then(res => setTransactions(res.data?.transactions || []))
      .catch(e => setTxError(e?.response?.data?.message || 'Failed to load top-up history'))
      .finally(() => setTxLoading(false));

    axios.get('/payment-logs/me')
      .then(res => { setPayments(res.data?.logs || []); setTotalPaid(Number(res.data?.totalPaid || 0)); })
      .catch(e => setPayError(e?.response?.data?.message || 'Failed to load payment history'))
      .finally(() => setPayLoading(false));
  }, []);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError(''); setMessage('');
    try {
      const res = await axios.put(`/users/${user?.id}`, profileData);
      updateUser(res.data.user);
      setMessage('Profile updated successfully.');
      setIsEditing(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally { setIsLoading(false); }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Passwords do not match'); return;
    }
    setIsLoading(true); setError(''); setMessage('');
    try {
      await axios.put(`/users/${user?.id}/password`, {
        currentPassword: passwordData.currentPassword,
        newPassword:     passwordData.newPassword,
      });
      setMessage('Password updated successfully.');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update password');
    } finally { setIsLoading(false); }
  };

  const handleToggleEmailNotif = async () => {
    setNotifSaving(true); setNotifMsg('');
    try {
      const res = await axios.put(`/users/${user?.id}`, {
        emailNotifications: !(user as any)?.emailNotifications,
      });
      updateUser(res.data.user);
      setNotifMsg('Saved.');
      setTimeout(() => setNotifMsg(''), 2000);
    } catch { setNotifMsg('Failed to save.'); }
    finally { setNotifSaving(false); }
  };

  const cancelEdit = () => {
    setIsEditing(false); setError(''); setMessage('');
    setProfileData({ firstName: user?.firstName||'', lastName: user?.lastName||'', email: user?.email||'' });
  };
  const cancelPw = () => {
    setIsChangingPassword(false);
    setPasswordData({ currentPassword:'', newPassword:'', confirmPassword:'' });
    setError(''); setMessage('');
  };

  const initials     = `${user?.firstName?.charAt(0)??''}${user?.lastName?.charAt(0)??''}`;
  const emailNotifOn = (user as any)?.emailNotifications !== false;

  const roleBadgeStyle: React.CSSProperties = {
    fontSize: '0.63rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
    letterSpacing: '0.04em', textTransform: 'capitalize',
    ...(user?.role === 'admin'    ? { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' } :
        user?.role === 'reseller' ? { background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' } :
                                    { background: 'var(--navy-100)', color: 'var(--navy-600)', border: '1px solid var(--navy-200)' }),
  };

  const typeLabel: Record<TxType, string> = { topup: 'Top Up', deduction: 'Deduction', adjustment: 'Adjustment' };
  const typeColor: Record<TxType, string> = { topup: '#059669', deduction: '#DC2626', adjustment: '#2563EB' };
  const filteredTx   = transactions.filter(t => txFilter === 'all' || t.type === txFilter);
  const totalTopups  = transactions.filter(t => t.type === 'topup').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);

  // ── Password form (used in both read-mode card and edit-mode column) ─────────
  const PasswordForm = () => (
    <form onSubmit={handlePasswordSubmit} style={{ padding: '0.9rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {([
        { id: 'currentPassword', label: 'Current password', show: showCurrentPw, toggle: () => setShowCurrentPw(p => !p) },
        { id: 'newPassword',     label: 'New password',     show: showNewPw,     toggle: () => setShowNewPw(p => !p) },
        { id: 'confirmPassword', label: 'Confirm password', show: showConfirmPw, toggle: () => setShowConfirmPw(p => !p) },
      ] as const).map(({ id, label, show, toggle }) => (
        <div key={id}>
          <label className="form-label" style={{ fontSize: '0.68rem', fontFamily: FONT }}>{label}</label>
          <div style={{ position: 'relative' }}>
            <input
              id={id} name={id} type={show ? 'text' : 'password'}
              required minLength={8} className="form-input"
              style={{ paddingRight: '2.4rem', fontSize: '0.82rem', fontFamily: FONT }}
              value={(passwordData as any)[id]}
              onChange={e => setPasswordData({ ...passwordData, [id]: e.target.value })}
            />
            <button type="button" onClick={toggle} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 0, display: 'flex' }}>
              {show ? <EyeSlashIcon style={{ width: 14, height: 14 }} /> : <EyeIcon style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </div>
      ))}
      {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
        <p style={{ fontSize: '0.7rem', color: 'var(--danger-600)', margin: 0 }}>Passwords do not match</p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, paddingTop: 2 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={cancelPw} style={{ fontFamily: FONT }}>Cancel</button>
        <button type="submit" disabled={isLoading || passwordData.newPassword !== passwordData.confirmPassword} className="btn btn-primary btn-sm" style={{ fontFamily: FONT }}>
          {isLoading ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </form>
  );

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontFamily: FONT }}
         className="animate-fadeIn">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
        borderRadius: 16, padding: '1.25rem 1.6rem',
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', gap: '1.25rem',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 40% 80% at 5% 50%, rgba(59,130,246,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Avatar */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.2rem', fontWeight: 800, color: '#fff',
          border: '2.5px solid rgba(255,255,255,0.18)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
          position: 'relative', zIndex: 1, letterSpacing: '-0.02em',
        }}>
          {initials || <UserCircleIcon style={{ width: 28, height: 28 }} />}
        </div>

        {/* Name / meta */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {user?.firstName} {user?.lastName}
            </h1>
            <span style={roleBadgeStyle}>{user?.role}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(148,163,184,0.75)' }}>{user?.email}</div>
          {user?.createdAt && (
            <div style={{ fontSize: '0.68rem', color: 'rgba(100,116,139,0.65)', marginTop: 2 }}>
              Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>

        {/* Edit button */}
        <button
          onClick={() => { setIsEditing(e => !e); setIsChangingPassword(false); setError(''); setMessage(''); }}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
            background: isEditing ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.1)',
            border: `1px solid ${isEditing ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.2)'}`,
            color: isEditing ? '#FCA5A5' : '#fff',
            borderRadius: 8, padding: '0.45rem 0.85rem',
            fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.18s', position: 'relative', zIndex: 1, fontFamily: FONT,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = isEditing ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.18)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isEditing ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.1)'; }}
        >
          <PencilIcon style={{ width: 12, height: 12 }} />
          {isEditing ? 'Cancel' : 'Edit Profile'}
        </button>
      </div>

      {/* ── Alerts ───────────────────────────────────────────── */}
      {message && (
        <div className="alert alert-success" style={{ padding: '0.55rem 0.9rem', borderRadius: 10 }}>
          <CheckCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem', fontFamily: FONT }}>{message}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-danger" style={{ padding: '0.55rem 0.9rem', borderRadius: 10 }}>
          <ExclamationCircleIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem', fontFamily: FONT }}>{error}</span>
        </div>
      )}

      {/* ── Reseller white-label portal names ───────────────────── */}
      {user?.role === 'reseller' && (
        <div className="db-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0.65rem 1.1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SLabel text="White-Label Portal Names" accent="#7C3AED" />
          </div>
          <div style={{ padding: '0.9rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--navy-500)', margin: 0, lineHeight: 1.5 }}>
              Your clients never see the backend shipping provider's name. Set the label they see for each option below — leave blank to use the default.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem' }}>
              {(['shippershub', 'labelcrow', 'shiplabel'] as const).map(key => (
                <div key={key}>
                  <label className="form-label" style={{ fontSize: '0.68rem', fontFamily: FONT }}>
                    "{DEFAULT_PORTAL_NAMES[key]}" option
                  </label>
                  <input
                    type="text" maxLength={40} className="form-input"
                    placeholder={DEFAULT_PORTAL_NAMES[key]}
                    style={{ fontSize: '0.82rem', fontFamily: FONT }}
                    value={portalLabelForm[key]}
                    onChange={e => setPortalLabelForm({ ...portalLabelForm, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 2 }}>
              {portalLabelMsg && (
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: portalLabelMsg === 'Saved.' ? '#16A34A' : '#DC2626' }}>
                  {portalLabelMsg}
                </span>
              )}
              <button
                type="button" className="btn btn-primary btn-sm" style={{ fontFamily: FONT }}
                disabled={portalLabelSaving} onClick={handleSavePortalLabels}
              >
                {portalLabelSaving ? 'Saving…' : 'Save Names'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          READ MODE — single compact settings card
          (no 2-column grid, no wasted left card)
         ══════════════════════════════════════════════════════ */}
      {!isEditing && !isChangingPassword && (
        <div className="db-card" style={{ overflow: 'hidden' }}>

          {/* Row: Security */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F5F3FF', border: '1px solid #DDD6FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <KeyIcon style={{ width: 14, height: 14, color: '#6366F1' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)' }}>Password</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', letterSpacing: '0.08em' }}>••••••••••••</div>
              </div>
            </div>
            <button
              onClick={() => { setIsChangingPassword(true); setIsEditing(false); setError(''); setMessage(''); }}
              className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT }}
            >
              <KeyIcon style={{ width: 12, height: 12 }} /> Change
            </button>
          </div>

          <RowDivider />

          {/* Row: Notifications */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: emailNotifOn ? '#EFF6FF' : 'var(--navy-100)',
                border: `1px solid ${emailNotifOn ? '#BFDBFE' : 'var(--navy-200)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s, border-color 0.2s',
              }}>
                {emailNotifOn
                  ? <BellIcon      style={{ width: 14, height: 14, color: '#2563EB' }} />
                  : <BellSlashIcon style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />
                }
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)' }}>Announcement emails</div>
                <div style={{ fontSize: '0.7rem', color: notifMsg ? (notifMsg === 'Saved.' ? '#16A34A' : '#DC2626') : 'var(--navy-400)', fontWeight: notifMsg ? 600 : 400, minHeight: 16 }}>
                  {notifMsg || (emailNotifOn ? 'Enabled' : 'Disabled')}
                </div>
              </div>
            </div>
            <button
              onClick={handleToggleEmailNotif}
              disabled={notifSaving}
              title={emailNotifOn ? 'Turn off' : 'Turn on'}
              style={{
                width: 40, height: 22, borderRadius: 99, border: 'none', flexShrink: 0,
                background: emailNotifOn ? '#2563EB' : 'var(--navy-200)',
                position: 'relative', cursor: notifSaving ? 'not-allowed' : 'pointer',
                transition: 'background 0.25s', opacity: notifSaving ? 0.6 : 1, padding: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: emailNotifOn ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </button>
          </div>

          <RowDivider />

          {/* Row: Last Login + Stats (horizontal) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
            {[
              {
                label: 'Last Login',
                value: user?.lastLogin
                  ? new Date(user.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : 'Never',
                icon: ClockIcon, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE',
              },
              {
                label: 'Total Deposited',
                value: `$${totalTopups.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                icon: CurrencyDollarIcon, color: '#059669', bg: '#F0FDF4', border: '#BBF7D0',
              },
              {
                label: 'Transactions',
                value: transactions.length,
                icon: ShieldCheckIcon, color: '#6366F1', bg: '#F5F3FF', border: '#DDD6FE',
              },
            ].map(({ label, value, icon: Icon, color, bg, border }, i, arr) => (
              <div key={label} style={{
                padding: '0.85rem 1.1rem',
                borderRight: i < arr.length - 1 ? '1px solid var(--navy-100)' : 'none',
                display: 'flex', alignItems: 'center', gap: 9,
              }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon style={{ width: 13, height: 13, color }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          EDIT MODE — 2-column form layout
         ══════════════════════════════════════════════════════ */}
      {isEditing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.75rem', alignItems: 'start' }}>

          {/* Left: edit form */}
          <div className="db-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.65rem 1.1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <SLabel text="Edit Profile" accent="#3B82F6" />
              <UserCircleIcon style={{ width: 14, height: 14, color: 'var(--navy-300)' }} />
            </div>
            <form onSubmit={handleProfileSubmit} style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                {(['firstName', 'lastName'] as const).map(field => (
                  <div key={field}>
                    <label className="form-label" style={{ fontSize: '0.68rem', fontFamily: FONT }}>
                      {field === 'firstName' ? 'First Name' : 'Last Name'}
                    </label>
                    <input type="text" required className="form-input" style={{ fontSize: '0.82rem', fontFamily: FONT }}
                      value={profileData[field]}
                      onChange={e => setProfileData({ ...profileData, [field]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.68rem', fontFamily: FONT }}>Email Address</label>
                <input type="email" required className="form-input" style={{ fontSize: '0.82rem', fontFamily: FONT }}
                  value={profileData.email}
                  onChange={e => setProfileData({ ...profileData, email: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, paddingTop: 2 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit} style={{ fontFamily: FONT }}>Cancel</button>
                <button type="submit" disabled={isLoading} className="btn btn-primary btn-sm" style={{ fontFamily: FONT }}>
                  {isLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Right: Security + Notifications (one card, two rows) */}
          <div className="db-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.65rem 1.1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <SLabel text="Settings" accent="#6366F1" />
              <ShieldCheckIcon style={{ width: 14, height: 14, color: 'var(--navy-300)' }} />
            </div>

            {/* Password row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: '#F5F3FF', border: '1px solid #DDD6FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <KeyIcon style={{ width: 13, height: 13, color: '#6366F1' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)' }}>Password</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)', letterSpacing: '0.08em' }}>••••••••••••</div>
                </div>
              </div>
              <button onClick={() => { setIsChangingPassword(true); setIsEditing(false); }} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT }}>
                <KeyIcon style={{ width: 12, height: 12 }} /> Change
              </button>
            </div>

            <RowDivider />

            {/* Notifications row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: emailNotifOn ? '#EFF6FF' : 'var(--navy-100)',
                  border: `1px solid ${emailNotifOn ? '#BFDBFE' : 'var(--navy-200)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {emailNotifOn
                    ? <BellIcon      style={{ width: 13, height: 13, color: '#2563EB' }} />
                    : <BellSlashIcon style={{ width: 13, height: 13, color: 'var(--navy-400)' }} />
                  }
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)' }}>Emails</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>{emailNotifOn ? 'Enabled' : 'Disabled'}</div>
                </div>
              </div>
              <button onClick={handleToggleEmailNotif} disabled={notifSaving} title={emailNotifOn ? 'Turn off' : 'Turn on'}
                style={{ width: 38, height: 20, borderRadius: 99, border: 'none', flexShrink: 0, background: emailNotifOn ? '#2563EB' : 'var(--navy-200)', position: 'relative', cursor: notifSaving ? 'not-allowed' : 'pointer', transition: 'background 0.25s', opacity: notifSaving ? 0.6 : 1, padding: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: emailNotifOn ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)' }} />
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          PASSWORD CHANGE — full-width compact form
         ══════════════════════════════════════════════════════ */}
      {isChangingPassword && (
        <div className="db-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0.65rem 1.1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SLabel text="Change Password" accent="#6366F1" />
            <ShieldCheckIcon style={{ width: 14, height: 14, color: 'var(--navy-300)' }} />
          </div>
          <PasswordForm />
        </div>
      )}

      {/* ── Balance History ───────────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0.65rem 1.1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SLabel text="Balance History" accent="#10B981" />
            {!txLoading && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 99, padding: '1px 7px' }}>
                +${totalTopups.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FunnelIcon style={{ width: 12, height: 12, color: 'var(--navy-400)' }} />
            <select className="form-input" value={txFilter} onChange={e => setTxFilter(e.target.value as 'all' | TxType)}
              style={{ padding: '0.25rem 1.8rem 0.25rem 0.55rem', fontSize: '0.72rem', minWidth: 140, height: 28, fontFamily: FONT }}>
              <option value="all">All transactions</option>
              <option value="topup">Top ups</option>
              <option value="deduction">Deductions</option>
              <option value="adjustment">Adjustments</option>
            </select>
          </div>
        </div>

        {txLoading ? (
          <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : txError ? (
          <div style={{ padding: '0.9rem 1.1rem', color: 'var(--danger-600)', fontSize: '0.78rem', fontWeight: 600 }}>{txError}</div>
        ) : filteredTx.length === 0 ? (
          <div style={{ padding: '1.25rem 1.1rem', color: 'var(--navy-400)', fontSize: '0.78rem', textAlign: 'center' }}>No transactions found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
              </thead>
              <tbody>
                {filteredTx.map((t, idx) => {
                  const amt = Number(t.amount || 0);
                  const isPos = amt >= 0;
                  const color = typeColor[t.type];
                  return (
                    <tr key={t._id || `${t.createdAt}-${idx}`}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.77rem' }}>
                        {new Date(t.createdAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <span className="badge" style={{ background: `${color}18`, color, border: `1px solid ${color}30`, fontSize: '0.67rem', fontWeight: 700 }}>
                          {typeLabel[t.type]}
                        </span>
                      </td>
                      <td style={{ maxWidth: 300, fontSize: '0.77rem' }}>{t.description || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '0.8rem', color: isPos ? '#059669' : '#DC2626' }}>
                        {isPos ? '+' : '-'}${Math.abs(amt).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Payment History ───────────────────────────────────── */}
      <div className="db-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0.65rem 1.1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SLabel text="Payment History" accent="#3B82F6" />
            {!payLoading && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 99, padding: '1px 7px' }}>
                ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total paid
              </span>
            )}
          </div>
        </div>

        {payLoading ? (
          <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : payError ? (
          <div style={{ padding: '0.9rem 1.1rem', color: 'var(--danger-600)', fontSize: '0.78rem', fontWeight: 600 }}>{payError}</div>
        ) : payments.length === 0 ? (
          <div style={{ padding: '1.25rem 1.1rem', color: 'var(--navy-400)', fontSize: '0.78rem', textAlign: 'center' }}>No payment records found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr><th>Date</th><th>Wallet</th><th>Note</th><th>Proof</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
              </thead>
              <tbody>
                {payments.map(log => (
                  <tr key={log._id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.77rem' }}>
                      {new Date(log.date).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontSize: '0.77rem' }}>{log.wallet?.name || '—'}</td>
                    <td style={{ maxWidth: 240, fontSize: '0.77rem' }}>{log.note || '—'}</td>
                    <td>
                      {log.screenshots?.length
                        ? <a href={log.screenshots[0]} target="_blank" rel="noreferrer" style={{ color: '#2563EB', fontWeight: 700, fontSize: '0.74rem', textDecoration: 'none' }}>View proof</a>
                        : <span style={{ color: 'var(--navy-300)', fontSize: '0.77rem' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '0.8rem', color: '#059669' }}>
                      ${Number(log.amount || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default Profile;
