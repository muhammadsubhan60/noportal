import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import BrandMonogram from '../components/BrandMonogram';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const inp: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  background: 'var(--navy-50)',
  border: '1.5px solid var(--navy-200)',
  borderRadius: 8,
  color: 'var(--navy-900)',
  fontSize: '0.84rem',
  fontFamily: FONT,
  outline: 'none',
  transition: 'border-color 0.18s, box-shadow 0.18s',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--navy-500)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 5,
};

function checkRules(pw: string) {
  return {
    length:  pw.length >= 8,
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(pw),
  };
}

const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const rules = checkRules(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rules.length || !rules.special) {
      setError('Password must be at least 8 characters and contain at least one special character.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/reset-password`, { token, password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy-50)', padding: '24px 16px', fontFamily: FONT }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--navy-500)', marginBottom: 16 }}>Invalid reset link.</p>
          <Link to="/forgot-password" style={{ color: '#6366f1', fontWeight: 700 }}>Request a new one</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy-50)', padding: '24px 16px', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 34, height: 34, background: '#0F172A', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BrandMonogram size={18} color="#fff" strokeWidth={2.2} />
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.4px' }}>Label Flow</span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 16, padding: '36px 32px', boxShadow: 'var(--shadow-lg)' }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f0fdf4', border: '1.5px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircleIcon style={{ width: 28, height: 28, color: '#16a34a' }} />
                </div>
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', marginBottom: 8 }}>Password updated!</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--navy-500)', lineHeight: 1.65, marginBottom: 24 }}>Your password has been reset successfully. Redirecting you to sign in...</p>
              <Link to="/login" style={{ display: 'block', padding: '11px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: '0.875rem', borderRadius: 10, textDecoration: 'none', textAlign: 'center' }}>
                Sign In Now
              </Link>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', marginBottom: 4 }}>Set new password</h3>
                <p style={{ fontSize: '0.83rem', color: 'var(--navy-500)' }}>Choose a strong password for your account.</p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lbl}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'} required
                      value={password} onChange={e => setPassword(e.target.value)}
                      style={{ ...inp, paddingRight: '2.4rem' }} placeholder="Min. 8 chars + special char"
                      onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' })}
                      onBlur={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' })}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 0, display: 'flex' }}>
                      {showPw ? <EyeSlashIcon style={{ width: 16, height: 16 }} /> : <EyeIcon style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>

                  {password && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[
                        { ok: rules.length,  label: 'At least 8 characters' },
                        { ok: rules.special, label: 'Contains a special character (!@#$% etc.)' },
                      ].map(({ ok, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: ok ? '#16a34a' : 'var(--navy-400)' }}>
                          <CheckCircleIcon style={{ width: 13, height: 13, flexShrink: 0, color: ok ? '#16a34a' : 'var(--navy-300)' }} />
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label style={lbl}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirm ? 'text' : 'password'} required
                      value={confirm} onChange={e => setConfirm(e.target.value)}
                      style={{ ...inp, paddingRight: '2.4rem' }} placeholder="Re-enter password"
                      onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' })}
                      onBlur={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' })}
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 0, display: 'flex' }}>
                      {showConfirm ? <EyeSlashIcon style={{ width: 16, height: 16 }} /> : <EyeIcon style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, fontSize: '0.8rem', color: '#dc2626', fontWeight: 500 }}>
                    <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit" disabled={loading}
                  style={{
                    width: '100%', padding: '0.65rem',
                    background: loading ? 'var(--navy-300)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.88rem', fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT, opacity: loading ? 0.7 : 1,
                    boxShadow: loading ? 'none' : '0 4px 14px rgba(99,102,241,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  {loading ? (
                    <>
                      <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                      Resetting...
                    </>
                  ) : 'Reset Password'}
                </button>
              </form>

              <div style={{ height: 1, background: 'var(--navy-100)', margin: '20px 0' }} />
              <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--navy-500)' }}>
                <Link to="/forgot-password" style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>Request a new link</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
