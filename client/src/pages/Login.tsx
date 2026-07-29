import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, EyeSlashIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

const Login: React.FC = () => {
  const [formData, setFormData]     = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const { login, isAuthenticated, isLoading, error } = useAuth();
  const navigate  = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await login(formData.email, formData.password); } catch {}
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    background: 'var(--navy-50)',
    border: '1.5px solid var(--navy-200)',
    borderRadius: 8,
    color: 'var(--navy-900)',
    fontSize: '0.84rem',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    transition: 'border-color 0.18s, box-shadow 0.18s, background 0.18s',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.68rem',
    fontWeight: 700,
    color: 'var(--navy-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 5,
    fontFamily: 'var(--font-sans)',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      background: 'var(--navy-50)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--bg-card)',
        border: '1px solid var(--navy-200)',
        borderRadius: 16,
        padding: '40px 36px',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ marginBottom: 24 }}>
          <h3 style={{
            fontSize: '1.4rem', fontWeight: 800,
            color: 'var(--navy-900)', letterSpacing: '-0.6px',
            marginBottom: 4, fontFamily: 'var(--font-sans)',
          }}>
            Sign In
          </h3>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="email" style={labelStyle}>Email Address</label>
            <input
              id="email" name="email" type="email" autoComplete="email" required
              style={inputStyle}
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              onFocus={e => Object.assign(e.currentTarget.style, {
                borderColor: 'var(--accent-500)',
                boxShadow: '0 0 0 3px rgba(99,102,241,0.13)',
                background: 'var(--bg-card)',
              })}
              onBlur={e => Object.assign(e.currentTarget.style, {
                borderColor: 'var(--navy-200)',
                boxShadow: 'none',
                background: 'var(--navy-50)',
              })}
            />
          </div>

          <div>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password" name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password" required
                style={{ ...inputStyle, paddingRight: '2.4rem' }}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                onFocus={e => Object.assign(e.currentTarget.style, {
                  borderColor: 'var(--accent-500)',
                  boxShadow: '0 0 0 3px rgba(99,102,241,0.13)',
                  background: 'var(--bg-card)',
                })}
                onBlur={e => Object.assign(e.currentTarget.style, {
                  borderColor: 'var(--navy-200)',
                  boxShadow: 'none',
                  background: 'var(--navy-50)',
                })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--navy-400)', padding: 0, display: 'flex',
                }}
              >
                {showPassword
                  ? <EyeSlashIcon style={{ width: 16, height: 16 }} />
                  : <EyeIcon      style={{ width: 16, height: 16 }} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--navy-400)', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
              Forgot password? Contact your admin.
            </span>
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 12px',
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: 8,
              fontSize: '0.8rem', color: '#dc2626', fontWeight: 500, fontFamily: 'var(--font-sans)',
            }}>
              <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.65rem',
              background: isLoading
                ? 'var(--navy-300)'
                : 'linear-gradient(135deg, var(--accent-500) 0%, #4f46e5 100%)',
              border: 'none', borderRadius: 8,
              color: '#fff', fontSize: '0.88rem', fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '-0.1px',
              marginTop: 4,
              boxShadow: isLoading ? 'none' : '0 4px 14px rgba(99,102,241,0.3)',
              transition: 'opacity 0.18s, box-shadow 0.18s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? (
              <>
                <div style={{
                  width: 15, height: 15,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'spin 0.75s linear infinite', flexShrink: 0,
                }} />
                Signing in...
              </>
            ) : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
