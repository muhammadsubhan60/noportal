import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  EyeIcon,
  EyeSlashIcon,
  TruckIcon,
  ExclamationCircleIcon,
  ShieldCheckIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import BrandMonogram from '../components/BrandMonogram';

function useViewport() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return w;
}

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState('');
  const { register, isAuthenticated, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const vw = useViewport();

  const isMobile = vw < 768;
  const isTablet = vw >= 768 && vw < 1024;

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalError('');
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    const { firstName, lastName, email, password, confirmPassword } = formData;
    if (!firstName.trim() || !lastName.trim()) { setLocalError('First and last name are required.'); return; }
    if (password !== confirmPassword) { setLocalError('Passwords do not match.'); return; }
    if (password.length < 8) { setLocalError('Password must be at least 8 characters.'); return; }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password)) { setLocalError('Password must contain at least one special character.'); return; }
    try { await register({ firstName, lastName, email, password }); } catch {}
  };

  const displayError = localError || error;

  const inputBase: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: '#f8faff',
    border: '1.5px solid #e6eaf5',
    borderRadius: 12,
    color: '#0a0f1f',
    fontSize: '0.95rem',
    fontFamily: "'Inter', system-ui, sans-serif",
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
    boxSizing: 'border-box',
  };

  const labelBase: React.CSSProperties = {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 7,
  };

  const linkStyle: React.CSSProperties = {
    color: '#6366f1',
    fontWeight: 700,
    textDecoration: 'none',
    transition: 'color 0.2s',
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    Object.assign(e.currentTarget.style, {
      borderColor: '#6366f1',
      boxShadow: '0 0 0 3px rgba(99,102,241,0.14)',
      background: '#fff',
    });
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    Object.assign(e.currentTarget.style, {
      borderColor: '#e6eaf5',
      boxShadow: 'none',
      background: '#f8faff',
    });
  };

  const PwField = ({ id, label, show, onToggle }: { id: string; label: string; show: boolean; onToggle: () => void }) => (
    <div>
      <label htmlFor={id} style={labelBase}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          required
          minLength={8}
          style={{ ...inputBase, paddingRight: '2.75rem' }}
          placeholder="••••••••"
          value={(formData as Record<string, string>)[id]}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={onToggle}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, display: 'flex' }}
        >
          {show ? <EyeSlashIcon style={{ width: 18, height: 18 }} /> : <EyeIcon style={{ width: 18, height: 18 }} />}
        </button>
      </div>
    </div>
  );

  const sideFeatures = [
    { icon: ShieldCheckIcon, text: 'Secure and reliable sessions' },
    { icon: ClockIcon, text: 'Fast daily shipping workflow' },
    { icon: TruckIcon, text: 'Bulk labels and manifest operations' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: 'hidden',
    }}>
      {!isMobile && (
        <div style={{
          width: isTablet ? '42%' : '48%',
          background: 'linear-gradient(145deg, #0a0f1f 0%, #111733 45%, #252a5a 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: isTablet ? '48px 40px' : '60px 64px',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23ffffff' fill-opacity='0.025'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 60% 50% at 20% 60%, rgba(34,211,238,0.16) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 80% 20%, rgba(99,102,241,0.20) 0%, transparent 70%), radial-gradient(ellipse 45% 35% at 70% 78%, rgba(251,113,133,0.14) 0%, transparent 75%)',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48, textDecoration: 'none' }}>
              <div style={{ width: 38, height: 38, background: '#fff', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>
                <BrandMonogram size={20} color="#111" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                Label<span> Flow</span>
              </span>
            </a>

            <h2 style={{
              fontSize: isTablet ? '1.8rem' : 'clamp(1.9rem, 3vw, 2.65rem)',
              fontWeight: 900, color: '#fff', letterSpacing: '-1.5px',
              lineHeight: 1.1, marginBottom: 18,
            }}>
              Start your seller<br />
              <span style={{ color: '#67e8f9' }}>shipping flow.</span>
            </h2>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.48)', lineHeight: 1.75, marginBottom: 40, fontWeight: 400, maxWidth: 360 }}>
              Create your Label Flow account and move from order sync to bulk label printing in one clean workspace.
            </p>

            {sideFeatures.map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9,
                  background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(103,232,249,0.38)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon style={{ width: 16, height: 16, color: '#67e8f9' }} />
                </div>
                <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-start' : 'center',
        padding: isMobile ? '0' : isTablet ? '32px 24px' : '48px 40px',
        background: isMobile ? '#fff' : 'linear-gradient(180deg, #fafbff 0%, #f1f4fb 100%)',
        minHeight: isMobile ? '100vh' : undefined,
      }}>
        {isMobile && (
          <div style={{
            width: '100%',
            background: 'linear-gradient(145deg, #0a0f1f 0%, #111733 45%, #252a5a 100%)',
            padding: '28px 24px 32px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, background: '#fff', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                <BrandMonogram size={18} color="#111" strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                Label<span> Flow</span>
              </span>
            </a>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              Modern shipping label operations
            </p>
          </div>
        )}

        <div style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 430,
          background: '#fff',
          border: isMobile ? 'none' : '1px solid #e6eaf5',
          borderRadius: isMobile ? 0 : 20,
          padding: isMobile ? '28px 20px 40px' : '42px 40px',
          boxShadow: isMobile ? 'none' : '0 20px 52px rgba(10,15,31,0.1), 0 4px 16px rgba(10,15,31,0.06)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a0f1f', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Create Account
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Fill in your details to get started</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label htmlFor="firstName" style={labelBase}>First Name</label>
                <input id="firstName" name="firstName" type="text" required autoComplete="given-name" style={inputBase} placeholder="John" value={formData.firstName} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} />
              </div>
              <div>
                <label htmlFor="lastName" style={labelBase}>Last Name</label>
                <input id="lastName" name="lastName" type="text" required autoComplete="family-name" style={inputBase} placeholder="Doe" value={formData.lastName} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} />
              </div>
            </div>

            <div>
              <label htmlFor="email" style={labelBase}>Email Address</label>
              <input id="email" name="email" type="email" required autoComplete="email" style={inputBase} placeholder="you@example.com" value={formData.email} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} />
            </div>

            <PwField id="password" label="Password" show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
            <PwField id="confirmPassword" label="Confirm Password" show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
            <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '-0.25rem' }}>
              Use at least 8 characters, including one special character, for stronger account security.
            </p>

            {displayError && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', background: '#fff1f2',
                border: '1px solid #fecdd3', borderRadius: 12,
                fontSize: '0.85rem', color: '#dc2626', fontWeight: 500,
              }}>
                <ExclamationCircleIcon style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span>{displayError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '13px',
                background: 'linear-gradient(135deg, #22d3ee 0%, #6366f1 54%, #fb7185 100%)',
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 800,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.2px',
                boxShadow: isLoading ? 'none' : '0 6px 22px rgba(99,102,241,0.35)',
                opacity: isLoading ? 0.6 : 1,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 10px 28px rgba(99,102,241,0.38)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = isLoading ? 'none' : '0 6px 22px rgba(99,102,241,0.35)';
              }}
            >
              {isLoading
                ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, marginRight: 8 }} />Creating account...</>
                : 'Create free account'
              }
            </button>
          </form>

          <div style={{ height: 1, background: '#e6eaf5', margin: '24px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            {['🔒 Secure', '✅ USPS Ready', '🇺🇸 US Support'].map((t) => (
              <span key={t} style={{
                padding: '4px 12px',
                background: '#f8faff',
                border: '1px solid #e6eaf5',
                borderRadius: 100,
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                letterSpacing: '0.04em',
              }}>
                {t}
              </span>
            ))}
          </div>

          <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
            Already have an account?{' '}
            <Link
              to="/login"
              style={linkStyle}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#4f46e5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6366f1'; }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
