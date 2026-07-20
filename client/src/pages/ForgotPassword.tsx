import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { EnvelopeIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
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

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/forgot-password`, { email });
      setSent(true);
    } catch (err: any) {
      // Backend always returns 200 for security; a real error means server issue
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #f0f4ff, #e8eeff)', border: '1.5px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <EnvelopeIcon style={{ width: 26, height: 26, color: '#6366f1' }} />
                </div>
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', marginBottom: 8 }}>Check your inbox</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--navy-500)', lineHeight: 1.65, marginBottom: 24 }}>
                If an account exists for <strong style={{ color: 'var(--navy-700)' }}>{email}</strong>, a password reset link has been sent. It expires in 10 minutes.
              </p>
              <Link to="/login" style={{ display: 'block', padding: '11px', background: 'none', border: '1px solid var(--navy-200)', color: 'var(--navy-600)', fontWeight: 600, fontSize: '0.875rem', borderRadius: 10, textDecoration: 'none', textAlign: 'center' }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.5px', marginBottom: 4 }}>Forgot password?</h3>
                <p style={{ fontSize: '0.83rem', color: 'var(--navy-500)' }}>Enter your email and we'll send you a reset link.</p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 5 }}>Email Address</label>
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    style={inp} placeholder="you@example.com"
                    onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' })}
                    onBlur={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' })}
                  />
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
                      Sending...
                    </>
                  ) : 'Send Reset Link'}
                </button>
              </form>

              <div style={{ height: 1, background: 'var(--navy-100)', margin: '20px 0' }} />
              <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--navy-500)' }}>
                Remember your password?{' '}
                <Link to="/login" style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
