import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  MegaphoneIcon, PlusIcon, PencilSquareIcon, TrashIcon,
  MapPinIcon, XMarkIcon, CheckIcon,
} from '@heroicons/react/24/outline';
import { MapPinIcon as MapPinSolid } from '@heroicons/react/24/solid';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const inp: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem', boxSizing: 'border-box',
  background: 'var(--navy-50)', border: '1.5px solid var(--navy-200)',
  borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.84rem',
  fontFamily: FONT, outline: 'none',
  transition: 'border-color 0.18s, box-shadow 0.18s',
};
const lbl: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 5, display: 'block', fontFamily: FONT,
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Announcement {
  _id: string;
  title: string;
  content: string;
  category: 'general' | 'service' | 'pricing' | 'maintenance';
  isPinned: boolean;
  isActive: boolean;
  createdBy?: { firstName: string; lastName: string };
  createdAt: string;
}

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORY: Record<string, { label: string; bg: string; color: string; border: string; accent: string }> = {
  general:     { label: 'General',     bg: 'rgba(29,78,216,0.08)',   color: '#1D4ED8', border: 'rgba(29,78,216,0.2)',   accent: '#1D4ED8' },
  service:     { label: 'Service',     bg: 'rgba(22,163,74,0.08)',   color: '#16A34A', border: 'rgba(22,163,74,0.2)',   accent: '#16A34A' },
  pricing:     { label: 'Pricing',     bg: 'rgba(217,119,6,0.08)',   color: '#D97706', border: 'rgba(217,119,6,0.2)',   accent: '#D97706' },
  maintenance: { label: 'Maintenance', bg: 'rgba(220,38,38,0.08)',   color: '#DC2626', border: 'rgba(220,38,38,0.2)',   accent: '#DC2626' },
};

// ── Modal ─────────────────────────────────────────────────────────────────────
interface ModalProps {
  initial?: Partial<Announcement>;
  onSave: (data: Partial<Announcement>) => Promise<void>;
  onClose: () => void;
}

const AnnouncementModal: React.FC<ModalProps> = ({ initial = {}, onSave, onClose }) => {
  const [form, setForm] = useState({
    title:    initial.title    ?? '',
    content:  initial.content  ?? '',
    category: initial.category ?? 'general',
    isPinned: initial.isPinned ?? false,
    isActive: initial.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const focusI = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' });
  const blurI = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' });

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9199, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      />
      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 9200,
        transform: 'translate(-50%, -50%)',
        width: 'calc(100% - 2rem)', maxWidth: 500,
        background: 'var(--bg-card)', borderRadius: 16,
        border: '1px solid var(--navy-200)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: FONT,
      }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MegaphoneIcon style={{ width: 14, height: 14, color: '#6366f1' }} />
            </div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>
              {initial._id ? 'Edit Announcement' : 'New Announcement'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4, borderRadius: 7, display: 'flex' }}>
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.55rem 0.875rem', fontSize: '0.8rem', color: '#dc2626', fontFamily: FONT }}>
              {error}
            </div>
          )}

          <div>
            <label style={lbl}>Title</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Announcement title…"
              style={inp}
              onFocus={focusI} onBlur={blurI}
            />
          </div>

          <div>
            <label style={lbl}>Content</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Write your announcement…"
              rows={4}
              style={{ ...inp, resize: 'vertical' }}
              onFocus={focusI} onBlur={blurI}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', alignItems: 'end' }}>
            <div>
              <label style={lbl}>Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))}
                style={{ ...inp, appearance: 'auto', cursor: 'pointer' }}
                onFocus={focusI} onBlur={blurI}
              >
                {Object.entries(CATEGORY).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'isPinned', label: 'Pin to top' },
                { key: 'isActive', label: 'Published' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <div
                    onClick={() => setForm(f => ({ ...f, [key]: !(f as any)[key] }))}
                    style={{
                      width: 34, height: 18, borderRadius: 99, position: 'relative', cursor: 'pointer', flexShrink: 0,
                      background: (form as any)[key] ? '#6366f1' : 'var(--navy-200)',
                      transition: 'background 0.18s',
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2, left: (form as any)[key] ? 16 : 2,
                      width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--navy-700)', fontWeight: 600, fontFamily: FONT }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1.5px solid var(--navy-200)', background: 'transparent', fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-600)', cursor: 'pointer', fontFamily: FONT }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff',
              fontSize: '0.82rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: FONT, boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
            }}
          >
            {saving ? 'Saving…' : <><CheckIcon style={{ width: 14, height: 14 }} /> Save</>}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

// ── Announcement Card ─────────────────────────────────────────────────────────
const AnnouncementCard: React.FC<{
  item: Announcement;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}> = ({ item, isAdmin, onEdit, onDelete, onTogglePin }) => {
  const cat = CATEGORY[item.category] ?? CATEGORY.general;
  const date = new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="db-card" style={{
      overflow: 'hidden',
      opacity: item.isActive ? 1 : 0.6,
      outline: item.isPinned ? '1.5px solid rgba(99,102,241,0.25)' : 'none',
      boxShadow: item.isPinned ? '0 0 0 3px rgba(99,102,241,0.06), var(--shadow-card)' : 'var(--shadow-card)',
    }}>
      {/* Category accent bar */}
      <div style={{
        height: 3,
        background: item.isPinned
          ? 'linear-gradient(90deg,#6366f1,#818cf8)'
          : cat.accent,
      }} />

      <div style={{ padding: '0.9rem 1.1rem' }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {item.isPinned && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99, fontFamily: FONT }}>
                <MapPinSolid style={{ width: 9, height: 9 }} /> Pinned
              </span>
            )}
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 99,
              background: cat.bg, color: cat.color, border: `1px solid ${cat.border}`,
              fontFamily: FONT,
            }}>
              {cat.label}
            </span>
            {!item.isActive && (
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy-400)', background: 'var(--navy-100)', border: '1px solid var(--navy-200)', padding: '2px 8px', borderRadius: 99, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: FONT }}>
                Draft
              </span>
            )}
          </div>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              <button
                onClick={onTogglePin}
                title={item.isPinned ? 'Unpin' : 'Pin'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 7, color: item.isPinned ? '#6366f1' : 'var(--navy-400)', display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-100)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <MapPinIcon style={{ width: 14, height: 14 }} />
              </button>
              <button
                onClick={onEdit}
                title="Edit"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 7, color: 'var(--navy-400)', display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-100)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <PencilSquareIcon style={{ width: 14, height: 14 }} />
              </button>
              <button
                onClick={onDelete}
                title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 5px', borderRadius: 7, color: '#ef4444', display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <TrashIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '0.4rem', lineHeight: 1.35, fontFamily: FONT }}>
          {item.title}
        </h3>

        {/* Content */}
        <p style={{ fontSize: '0.84rem', color: 'var(--navy-600)', lineHeight: 1.65, margin: 0, fontFamily: FONT }}>
          {item.content}
        </p>

        {/* Footer */}
        <div style={{ marginTop: '0.75rem', paddingTop: '0.625rem', borderTop: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT }}>
            {item.createdBy ? `${item.createdBy.firstName} ${item.createdBy.lastName}` : 'LABEL FLOW'}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontWeight: 600, fontFamily: FONT }}>{date}</span>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const API = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const Announcements: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [items,   setItems]   = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<{ open: boolean; item?: Announcement }>({ open: false });
  const [filter,  setFilter]  = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = isAdmin ? `${API}/announcements/all` : `${API}/announcements`;
      const token = localStorage.getItem('token');
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setItems(res.data.announcements);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Partial<Announcement>) => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    if (modal.item?._id) {
      await axios.put(`${API}/announcements/${modal.item._id}`, data, { headers });
    } else {
      await axios.post(`${API}/announcements`, data, { headers });
    }
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this announcement?')) return;
    const token = localStorage.getItem('token');
    await axios.delete(`${API}/announcements/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    setItems(prev => prev.filter(a => a._id !== id));
  };

  const handleTogglePin = async (item: Announcement) => {
    const token = localStorage.getItem('token');
    const res = await axios.put(`${API}/announcements/${item._id}`, { isPinned: !item.isPinned }, { headers: { Authorization: `Bearer ${token}` } });
    setItems(prev => prev.map(a => a._id === item._id ? res.data.announcement : a));
  };

  const filtered = filter === 'all' ? items : items.filter(a => a.category === filter);
  const pinned   = filtered.filter(a => a.isPinned);
  const rest     = filtered.filter(a => !a.isPinned);
  const ordered  = [...pinned, ...rest];

  const categories = ['all', 'general', 'service', 'pricing', 'maintenance'];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: FONT }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MegaphoneIcon style={{ width: 16, height: 16, color: '#6366f1' }} />
            </div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '-0.5px', fontFamily: FONT, margin: 0 }}>
              Announcements
            </h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--navy-400)', margin: '5px 0 0 40px', fontFamily: FONT }}>
            Platform updates, service notices, and important information.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setModal({ open: true })}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '0.55rem 1.1rem', borderRadius: 9,
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none',
              fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)', fontFamily: FONT,
            }}
          >
            <PlusIcon style={{ width: 15, height: 15 }} />
            New Announcement
          </button>
        )}
      </div>

      {/* ── Filter chips ── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {categories.map(cat => {
          const cfg    = cat === 'all' ? null : CATEGORY[cat];
          const active = filter === cat;
          const count  = cat !== 'all' ? items.filter(a => a.category === cat).length : items.length;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0.35rem 0.875rem', borderRadius: 99,
                border: `1.5px solid ${active ? (cfg?.border ?? 'rgba(99,102,241,0.3)') : 'var(--navy-200)'}`,
                background: active ? (cfg?.bg ?? 'rgba(99,102,241,0.08)') : 'transparent',
                color: active ? (cfg?.color ?? '#6366f1') : 'var(--navy-500)',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.12s', fontFamily: FONT,
              }}
            >
              {cat === 'all' ? 'All' : CATEGORY[cat].label}
              <span style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.65 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner" />
        </div>
      ) : ordered.length === 0 ? (
        <div className="db-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <MegaphoneIcon style={{ width: 24, height: 24, color: '#6366f1' }} />
          </div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-800)', marginBottom: 6, fontFamily: FONT }}>
            No announcements yet
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', fontFamily: FONT }}>
            {isAdmin ? 'Create the first announcement using the button above.' : 'Check back later for updates.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {ordered.map(item => (
            <AnnouncementCard
              key={item._id}
              item={item}
              isAdmin={isAdmin}
              onEdit={() => setModal({ open: true, item })}
              onDelete={() => handleDelete(item._id)}
              onTogglePin={() => handleTogglePin(item)}
            />
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {modal.open && (
        <AnnouncementModal
          initial={modal.item}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
};

export default Announcements;
