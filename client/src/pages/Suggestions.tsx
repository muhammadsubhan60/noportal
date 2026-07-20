import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  LightBulbIcon, BugAntIcon, PaintBrushIcon, SparklesIcon,
  ChevronUpIcon, ChatBubbleLeftIcon, PencilIcon, TrashIcon,
  XMarkIcon, CheckIcon, MapPinIcon, ArrowUpTrayIcon,
  ClockIcon, CheckCircleIcon, XCircleIcon, EyeIcon,
} from '@heroicons/react/24/outline';
import { ChevronUpIcon as ChevronUpSolid, MapPinIcon as MapPinSolid } from '@heroicons/react/24/solid';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

// ── Constants ────────────────────────────────────────────────────────────────
const CAT: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  feature: { label: 'Feature Request', color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  icon: LightBulbIcon },
  design:  { label: 'Design / UI',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: PaintBrushIcon },
  bug:     { label: 'Bug / Issue',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: BugAntIcon },
};

const STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:      { label: 'Pending',       color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: ClockIcon },
  under_review: { label: 'Under Review',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: EyeIcon },
  planned:      { label: 'Planned',       color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  icon: SparklesIcon },
  done:         { label: 'Implemented',   color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: CheckCircleIcon },
  declined:     { label: 'Declined',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: XCircleIcon },
};

interface Comment { _id: string; authorName: string; text: string; createdAt: string; author: string; }
interface AdminReply { text: string; updatedAt: string; }
interface Suggestion {
  _id: string; title: string; description: string; category: string;
  imageData?: string; status: string; isPinned: boolean; isApproved: boolean;
  authorName: string; author: string;
  upvoteCount: number; hasUpvoted: boolean;
  comments: Comment[]; adminReply?: AdminReply;
  createdAt: string;
}

// ── Chip ─────────────────────────────────────────────────────────────────────
const Chip: React.FC<{ conf: { label: string; color: string; bg: string; icon: React.ElementType } }> = ({ conf }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 9px', borderRadius: 99,
    background: conf.bg, color: conf.color,
    fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', fontFamily: FONT,
    border: `1px solid ${conf.color}28`,
  }}>
    <conf.icon style={{ width: 10, height: 10 }} />
    {conf.label}
  </span>
);

// ── Avatar initials ───────────────────────────────────────────────────────────
const Av: React.FC<{ name: string; size?: number }> = ({ name, size = 26 }) => {
  const parts = name.trim().split(' ');
  const ini   = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36 + 'px', fontWeight: 700, color: '#fff', fontFamily: FONT,
    }}>{ini.toUpperCase()}</div>
  );
};

// ── Input style ───────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem',
  background: 'var(--navy-50)', border: '1.5px solid var(--navy-200)',
  borderRadius: 8, color: 'var(--navy-900)', fontSize: '0.84rem',
  fontFamily: FONT, outline: 'none',
  transition: 'border-color 0.18s, box-shadow 0.18s',
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 5, display: 'block', fontFamily: FONT,
};

// ── Suggestion Card ───────────────────────────────────────────────────────────
interface CardProps {
  s: Suggestion; currentUserId: string; isAdmin: boolean;
  onUpvote: (id: string) => void;
  onComment: (s: Suggestion) => void;
  onEdit: (s: Suggestion) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string, approved: boolean) => void;
  onPin: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

const SuggestionCard: React.FC<CardProps> = ({
  s, currentUserId, isAdmin,
  onUpvote, onComment, onEdit, onDelete, onApprove, onPin, onStatusChange,
}) => {
  const cat    = CAT[s.category]    ?? CAT.feature;
  const status = STATUS[s.status]   ?? STATUS.pending;
  const isOwn  = s.author === currentUserId;

  return (
    <div className="db-card" style={{ padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', overflow: 'hidden' }}>

      {/* Pinned stripe */}
      {s.isPinned && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg,#f59e0b,#fbbf24)',
        }} />
      )}

      {/* Top row: badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap', marginTop: s.isPinned ? 4 : 0 }}>
        {s.isPinned && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 700, color: '#f59e0b', fontFamily: FONT }}>
            <MapPinSolid style={{ width: 10, height: 10 }} />
            Featured
          </span>
        )}
        {!s.isApproved && isAdmin && (
          <span style={{ padding: '2px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: '0.6rem', fontWeight: 700, fontFamily: FONT, border: '1px solid rgba(245,158,11,0.3)' }}>
            Awaiting Approval
          </span>
        )}
        <Chip conf={cat} />
        <Chip conf={status} />
      </div>

      {/* Title */}
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: 5, lineHeight: 1.35, fontFamily: FONT }}>
        {s.title}
      </div>

      {/* Description */}
      <div style={{
        fontSize: '0.8rem', color: 'var(--navy-500)', lineHeight: 1.6,
        marginBottom: 10, fontFamily: FONT,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {s.description}
      </div>

      {/* Image thumbnail */}
      {s.imageData && (
        <div style={{ marginBottom: 10, borderRadius: 8, overflow: 'hidden', maxHeight: 140 }}>
          <img src={s.imageData} alt="attachment" style={{ width: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}

      {/* Admin reply */}
      {s.adminReply?.text && (
        <div style={{
          margin: '0 0 10px',
          padding: '8px 10px',
          background: 'rgba(59,130,246,0.07)',
          border: '1px solid rgba(59,130,246,0.18)',
          borderRadius: 8, borderLeft: '3px solid #3b82f6',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, fontFamily: FONT }}>
            Official Response
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--navy-700)', lineHeight: 1.55, fontFamily: FONT }}>
            {s.adminReply.text}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--navy-100)', flexWrap: 'wrap' }}>
        {/* Author + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <Av name={s.authorName || 'U'} size={22} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-700)', fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {s.authorName}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--navy-400)', fontFamily: FONT }}>
              {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Upvote */}
          <button
            onClick={() => onUpvote(s._id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 9px', borderRadius: 7,
              border: `1.5px solid ${s.hasUpvoted ? '#6366f1' : 'var(--navy-200)'}`,
              background: s.hasUpvoted ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: s.hasUpvoted ? '#6366f1' : 'var(--navy-500)',
              fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
              transition: 'all 0.15s',
            }}
          >
            {s.hasUpvoted
              ? <ChevronUpSolid style={{ width: 13, height: 13 }} />
              : <ChevronUpIcon  style={{ width: 13, height: 13 }} />}
            {s.upvoteCount}
          </button>

          {/* Comments */}
          <button
            onClick={() => onComment(s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 9px', borderRadius: 7,
              border: '1.5px solid var(--navy-200)',
              background: 'transparent', color: 'var(--navy-500)',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
              transition: 'all 0.15s',
            }}
          >
            <ChatBubbleLeftIcon style={{ width: 13, height: 13 }} />
            {s.comments.length}
          </button>

          {/* Owner edit/delete */}
          {(isOwn || isAdmin) && (
            <>
              <button onClick={() => onEdit(s)} style={{ padding: '4px 6px', border: '1.5px solid var(--navy-200)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex', transition: 'all 0.15s' }}>
                <PencilIcon style={{ width: 12, height: 12 }} />
              </button>
              <button onClick={() => onDelete(s._id)} style={{ padding: '4px 6px', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: '#ef4444', display: 'flex', transition: 'all 0.15s' }}>
                <TrashIcon style={{ width: 12, height: 12 }} />
              </button>
            </>
          )}

          {/* Admin-only controls */}
          {isAdmin && (
            <>
              {/* Approve toggle */}
              <button
                onClick={() => onApprove(s._id, !s.isApproved)}
                title={s.isApproved ? 'Unapprove' : 'Approve'}
                style={{
                  padding: '4px 6px', borderRadius: 6, border: `1.5px solid ${s.isApproved ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.25)'}`,
                  background: s.isApproved ? 'rgba(16,185,129,0.1)' : 'transparent',
                  cursor: 'pointer', color: '#10b981', display: 'flex', transition: 'all 0.15s',
                }}
              >
                <CheckIcon style={{ width: 12, height: 12 }} />
              </button>

              {/* Pin toggle */}
              <button
                onClick={() => onPin(s._id)}
                title={s.isPinned ? 'Unpin' : 'Pin / Feature'}
                style={{
                  padding: '4px 6px', borderRadius: 6,
                  border: `1.5px solid ${s.isPinned ? 'rgba(245,158,11,0.35)' : 'var(--navy-200)'}`,
                  background: s.isPinned ? 'rgba(245,158,11,0.1)' : 'transparent',
                  cursor: 'pointer', color: s.isPinned ? '#f59e0b' : 'var(--navy-400)', display: 'flex', transition: 'all 0.15s',
                }}
              >
                <MapPinIcon style={{ width: 12, height: 12 }} />
              </button>

              {/* Status select */}
              <select
                value={s.status}
                onChange={e => onStatusChange(s._id, e.target.value)}
                style={{
                  padding: '3px 6px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 600,
                  border: '1.5px solid var(--navy-200)', background: 'var(--navy-50)',
                  color: 'var(--navy-700)', cursor: 'pointer', fontFamily: FONT,
                }}
              >
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const Suggestions: React.FC = () => {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';
  const token    = localStorage.getItem('token');
  const headers  = { Authorization: `Bearer ${token}` };

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filterCat, setFilterCat]     = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Submit / Edit modal
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<Suggestion | null>(null);
  const [form, setForm]             = useState({ title: '', description: '', category: 'feature', imageData: '' });
  const [imagePreview, setImagePreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');

  // Comment drawer
  const [commentTarget, setCommentTarget] = useState<Suggestion | null>(null);
  const [newComment, setNewComment]       = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Admin reply modal
  const [replyTarget, setReplyTarget] = useState<Suggestion | null>(null);
  const [replyText, setReplyText]     = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/suggestions`, { headers: { Authorization: `Bearer ${token}` } });
      setSuggestions(res.data.suggestions);
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const visible = suggestions.filter(s => {
    if (filterCat !== 'all'    && s.category !== filterCat)   return false;
    if (filterStatus !== 'all' && s.status   !== filterStatus) return false;
    return true;
  });
  const pinned   = visible.filter(s => s.isPinned && s.isApproved);
  const approved = visible.filter(s => s.isApproved && !s.isPinned);
  const pending  = isAdmin ? visible.filter(s => !s.isApproved) : [];

  const stats = {
    total:       suggestions.filter(s => s.isApproved).length,
    underReview: suggestions.filter(s => s.status === 'under_review').length,
    implemented: suggestions.filter(s => s.status === 'done').length,
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openSubmit = () => {
    setEditTarget(null);
    setForm({ title: '', description: '', category: 'feature', imageData: '' });
    setImagePreview('');
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (s: Suggestion) => {
    setEditTarget(s);
    setForm({ title: s.title, description: s.description, category: s.category, imageData: s.imageData || '' });
    setImagePreview(s.imageData || '');
    setFormError('');
    setModalOpen(true);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) { setFormError('Image must be under 500 KB'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setForm(f => ({ ...f, imageData: data }));
      setImagePreview(data);
      setFormError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setFormError('Title and description are required.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      if (editTarget) {
        await axios.put(`${API_BASE}/suggestions/${editTarget._id}`, form, { headers });
      } else {
        await axios.post(`${API_BASE}/suggestions`, form, { headers });
      }
      setModalOpen(false);
      fetchAll();
    } catch (e: any) {
      setFormError(e.response?.data?.message || 'Something went wrong');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this suggestion?')) return;
    try {
      await axios.delete(`${API_BASE}/suggestions/${id}`, { headers });
      setSuggestions(prev => prev.filter(s => s._id !== id));
    } catch {}
  };

  const handleUpvote = async (id: string) => {
    try {
      const res = await axios.post(`${API_BASE}/suggestions/${id}/upvote`, {}, { headers });
      setSuggestions(prev => prev.map(s => s._id === id
        ? { ...s, upvoteCount: res.data.upvoteCount, hasUpvoted: res.data.hasUpvoted }
        : s
      ));
    } catch {}
  };

  const handleApprove = async (id: string, approved: boolean) => {
    try {
      await axios.put(`${API_BASE}/suggestions/${id}/status`, { isApproved: approved }, { headers });
      setSuggestions(prev => prev.map(s => s._id === id ? { ...s, isApproved: approved } : s));
    } catch {}
  };

  const handlePin = async (id: string) => {
    try {
      const res = await axios.put(`${API_BASE}/suggestions/${id}/pin`, {}, { headers });
      setSuggestions(prev => prev.map(s => s._id === id ? { ...s, isPinned: res.data.isPinned } : s));
    } catch {}
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await axios.put(`${API_BASE}/suggestions/${id}/status`, { status }, { headers });
      setSuggestions(prev => prev.map(s => s._id === id ? { ...s, status } : s));
    } catch {}
  };

  const openComment = (s: Suggestion) => {
    setCommentTarget(s);
    setNewComment('');
  };

  const handleComment = async () => {
    if (!newComment.trim() || !commentTarget) return;
    setPostingComment(true);
    try {
      const res = await axios.post(`${API_BASE}/suggestions/${commentTarget._id}/comment`, { text: newComment }, { headers });
      const updated = { ...commentTarget, comments: res.data.comments };
      setSuggestions(prev => prev.map(s => s._id === commentTarget._id ? updated : s));
      setCommentTarget(updated);
      setNewComment('');
    } catch {}
    setPostingComment(false);
  };

  const handleDeleteComment = async (cid: string) => {
    if (!commentTarget) return;
    try {
      await axios.delete(`${API_BASE}/suggestions/${commentTarget._id}/comment/${cid}`, { headers });
      const updated = { ...commentTarget, comments: commentTarget.comments.filter(c => c._id !== cid) };
      setSuggestions(prev => prev.map(s => s._id === commentTarget._id ? updated : s));
      setCommentTarget(updated);
    } catch {}
  };

  const handleReply = async () => {
    if (!replyTarget) return;
    try {
      await axios.put(`${API_BASE}/suggestions/${replyTarget._id}/reply`, { text: replyText }, { headers });
      setSuggestions(prev => prev.map(s => s._id === replyTarget._id
        ? { ...s, adminReply: { text: replyText, updatedAt: new Date().toISOString() } }
        : s
      ));
      setReplyTarget(null);
    } catch {}
  };

  const cardProps = (s: Suggestion) => ({
    s,
    currentUserId: user?.id || '',
    isAdmin,
    onUpvote:      handleUpvote,
    onComment:     openComment,
    onEdit:        openEdit,
    onDelete:      handleDelete,
    onApprove:     handleApprove,
    onPin:         handlePin,
    onStatusChange: handleStatusChange,
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.025em', margin: 0, fontFamily: FONT }}>
              Feedback Board
            </h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, fontFamily: FONT, border: '1px solid rgba(99,102,241,0.2)' }}>
              Community
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--navy-500)', margin: '0 0 10px', fontFamily: FONT }}>
            Share ideas, report issues, and vote on what gets built next.
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Ideas',   value: stats.total,       color: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.18)' },
              { label: 'Under Review',  value: stats.underReview, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.18)' },
              { label: 'Implemented',   value: stats.implemented, color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)' },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 11px', background: bg, border: `1px solid ${border}`, borderRadius: 99 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color, fontFamily: FONT }}>{value}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--navy-500)', fontFamily: FONT }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={openSubmit}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '0.6rem 1.2rem',
            background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
            border: 'none', borderRadius: 9, color: '#fff',
            fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(99,102,241,0.28)',
            fontFamily: FONT, flexShrink: 0, alignSelf: 'flex-start',
          }}
        >
          <LightBulbIcon style={{ width: 16, height: 16 }} />
          Submit Idea
        </button>
      </div>

      {/* ── How it works strip ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.7rem', marginBottom: '1.25rem' }}>
        {[
          { Icon: ChevronUpIcon,        color: '#6366f1', bg: 'rgba(99,102,241,0.07)',  border: 'rgba(99,102,241,0.15)', title: 'Upvote',   desc: 'Vote on ideas you want to see shipped' },
          { Icon: ChatBubbleLeftIcon,   color: '#0ea5e9', bg: 'rgba(14,165,233,0.07)',  border: 'rgba(14,165,233,0.15)', title: 'Discuss',  desc: 'Comment to add context or ask questions' },
          { Icon: LightBulbIcon,        color: '#f59e0b', bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.15)', title: 'Submit',   desc: 'Got an idea? Hit "Submit Idea" above', cta: true },
        ].map(({ Icon, color, bg, border, title, desc, cta }) => (
          <div
            key={title}
            onClick={cta ? openSubmit : undefined}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '0.75rem 1rem',
              background: bg, border: `1px solid ${border}`,
              borderRadius: 12, cursor: cta ? 'pointer' : 'default',
            }}
          >
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, border: `1px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon style={{ width: 15, height: 15, color }} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)', fontFamily: FONT, marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: '0.71rem', color: 'var(--navy-500)', fontFamily: FONT, lineHeight: 1.45 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="db-card" style={{ padding: '0.6rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {[['all', 'All'], ['feature', 'Feature'], ['design', 'Design'], ['bug', 'Bug']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilterCat(k)}
              style={{
                padding: '4px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: FONT,
                fontSize: '0.75rem', fontWeight: 600,
                background: filterCat === k ? 'var(--accent-500)' : 'var(--navy-100)',
                color: filterCat === k ? '#fff' : 'var(--navy-600)',
                transition: 'all 0.15s',
              }}
            >{l}</button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ ...inp, width: 'auto', padding: '4px 8px', fontSize: '0.75rem' }}
        >
          <option value="all">All Status</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--navy-400)', fontFamily: FONT }}>Loading...</div>
      ) : (
        <>
          {/* ── Admin pending approval section ─────────────────────────── */}
          {isAdmin && pending.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 3, height: 14, background: '#f59e0b', borderRadius: 99 }} />
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: FONT }}>
                  Awaiting Approval ({pending.length})
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '0.9rem' }}>
                {pending.map(s => (
                  <SuggestionCard key={s._id} {...cardProps(s)} />
                ))}
              </div>
            </div>
          )}

          {/* ── Pinned ────────────────────────────────────────────────── */}
          {pinned.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 3, height: 14, background: '#f59e0b', borderRadius: 99 }} />
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: FONT }}>
                  Featured
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '0.9rem' }}>
                {pinned.map(s => (
                  <SuggestionCard key={s._id} {...cardProps(s)} />
                ))}
              </div>
            </div>
          )}

          {/* ── Main board ────────────────────────────────────────────── */}
          {approved.length > 0 ? (
            <>
              {(pinned.length > 0 || (isAdmin && pending.length > 0)) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 3, height: 14, background: '#6366f1', borderRadius: 99 }} />
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: FONT }}>
                    All Ideas
                  </span>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '0.9rem' }}>
                {approved.map(s => (
                  <SuggestionCard key={s._id} {...cardProps(s)} />
                ))}
              </div>
            </>
          ) : (
            !isAdmin && pending.length === 0 && (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--navy-400)', fontFamily: FONT }}>
                <LightBulbIcon style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.3 }} />
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--navy-600)' }}>No suggestions yet</div>
                <div style={{ fontSize: '0.8rem', marginTop: 4 }}>Be the first to share an idea!</div>
              </div>
            )
          )}
        </>
      )}

      {/* ── Submit / Edit Drawer — portalled to body to escape transform stacking context ── */}
      {modalOpen && ReactDOM.createPortal(
        <>
          {/* Backdrop — separate fixed element so the panel can use top/right/bottom */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', zIndex: 9199 }}
            onClick={() => setModalOpen(false)}
          />

          {/* Drawer panel — explicit top/right/bottom gives flex: 1 a real height to grow into */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: '100%', maxWidth: 480,
            background: 'var(--bg-card)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '-12px 0 48px rgba(0,0,0,0.18)',
            zIndex: 9200,
            animation: 'slideInFromRight 0.24s cubic-bezier(0.16,1,0.3,1) both',
          }}>

            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--navy-100)',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(79,70,229,0.2))',
                border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <LightBulbIcon style={{ width: 17, height: 17, color: '#6366f1' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>
                  {editTarget ? 'Edit Suggestion' : 'Share an Idea'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT, marginTop: 1 }}>
                  {editTarget ? 'Update your suggestion below' : 'Help us build what matters most'}
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{ width: 30, height: 30, borderRadius: 7, border: '1.5px solid var(--navy-200)', background: 'transparent', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <XMarkIcon style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Title */}
              <div>
                <label style={lbl}>Title <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  style={inp}
                  placeholder="e.g. Add dark mode to the label history page"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' })}
                  onBlur={e  => Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' })}
                />
              </div>

              {/* Category — visual card selector */}
              <div>
                <label style={lbl}>Category <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {(Object.entries(CAT) as [string, typeof CAT[string]][]).map(([k, c]) => {
                    const active = form.category === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, category: k }))}
                        style={{
                          padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT,
                          border: `2px solid ${active ? c.color : 'var(--navy-200)'}`,
                          background: active ? c.bg : 'var(--navy-50)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                          transition: 'all 0.15s',
                        }}
                      >
                        <c.icon style={{ width: 18, height: 18, color: active ? c.color : 'var(--navy-400)' }} />
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: active ? c.color : 'var(--navy-500)', textAlign: 'center', lineHeight: 1.2 }}>
                          {c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={lbl}>Description <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea
                  style={{ ...inp, minHeight: 120, resize: 'vertical' }}
                  placeholder="What problem does this solve? How would it work? The more detail, the better."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99,102,241,0.12)' })}
                  onBlur={e  => Object.assign(e.currentTarget.style, { borderColor: 'var(--navy-200)', boxShadow: 'none' })}
                />
                <div style={{ textAlign: 'right', fontSize: '0.65rem', color: 'var(--navy-400)', marginTop: 3, fontFamily: FONT }}>
                  {form.description.length} / 2000
                </div>
              </div>

              {/* Image upload */}
              <div>
                <label style={lbl}>Attachment <span style={{ color: 'var(--navy-400)', fontWeight: 500, textTransform: 'none', fontSize: '0.65rem' }}>(optional · max 500 KB)</span></label>
                {imagePreview ? (
                  <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--navy-200)' }}>
                    <img src={imagePreview} alt="preview" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
                    <button
                      onClick={() => { setForm(f => ({ ...f, imageData: '' })); setImagePreview(''); }}
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 24, height: 24, borderRadius: '50%',
                        background: 'rgba(15,23,42,0.7)', border: 'none',
                        color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <XMarkIcon style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: '2px dashed var(--navy-200)', borderRadius: 10,
                      padding: '1.5rem 1rem', cursor: 'pointer', textAlign: 'center',
                      background: 'var(--navy-50)', transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(99,102,241,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--navy-200)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--navy-50)'; }}
                  >
                    <ArrowUpTrayIcon style={{ width: 22, height: 22, color: 'var(--navy-300)', margin: '0 auto 6px' }} />
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-600)', fontFamily: FONT }}>Click to upload</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', fontFamily: FONT, marginTop: 2 }}>PNG, JPG, GIF up to 500 KB</div>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />
              </div>

              {formError && (
                <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: '0.8rem', color: '#dc2626', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <XCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
                  {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--navy-100)',
              display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
              background: 'var(--bg-card)',
            }}>
              {!editTarget && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.12)' }}>
                  <EyeIcon style={{ width: 14, height: 14, color: '#6366f1', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)', fontFamily: FONT }}>
                    Your idea will be reviewed before appearing on the board.
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{ flex: 1, padding: '0.65rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-600)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{
                    flex: 2, padding: '0.65rem',
                    background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                    border: 'none', borderRadius: 8, color: '#fff',
                    fontSize: '0.85rem', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: FONT, boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                    opacity: submitting ? 0.7 : 1, transition: 'opacity 0.15s',
                  }}
                >
                  {submitting ? 'Submitting…' : editTarget ? 'Save Changes' : 'Submit Idea'}
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── Comment Drawer ────────────────────────────────────────────────── */}
      {commentTarget && ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', zIndex: 9200, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.14)', animation: 'slideInFromRight 0.22s ease both' }}>
            {/* Drawer header */}
            <div style={{ padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy-900)', fontFamily: FONT }}>{commentTarget.title}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)', fontFamily: FONT, marginTop: 2 }}>{commentTarget.comments.length} comment{commentTarget.comments.length !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setCommentTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex' }}>
                <XMarkIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Suggestion summary */}
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--navy-100)', background: 'var(--navy-50)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--navy-600)', lineHeight: 1.55, fontFamily: FONT }}>{commentTarget.description}</div>
              {isAdmin && (
                <button
                  onClick={() => { setReplyTarget(commentTarget); setReplyText(commentTarget.adminReply?.text || ''); setCommentTarget(null); }}
                  style={{ marginTop: 8, padding: '4px 10px', border: '1.5px solid rgba(59,130,246,0.3)', borderRadius: 6, background: 'rgba(59,130,246,0.07)', color: '#3b82f6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
                >
                  {commentTarget.adminReply?.text ? 'Edit Official Reply' : 'Add Official Reply'}
                </button>
              )}
            </div>

            {/* Comments list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {commentTarget.comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--navy-400)', fontSize: '0.8rem', fontFamily: FONT }}>
                  No comments yet. Be the first!
                </div>
              ) : (
                commentTarget.comments.map(c => (
                  <div key={c._id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Av name={c.authorName || 'U'} size={28} />
                    <div style={{ flex: 1, background: 'var(--navy-50)', borderRadius: 10, padding: '7px 10px', position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-700)', fontFamily: FONT }}>{c.authorName}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--navy-400)', fontFamily: FONT }}>
                            {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          {(c.author === (user?.id || '') || isAdmin) && (
                            <button onClick={() => handleDeleteComment(c._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: 0 }}>
                              <TrashIcon style={{ width: 11, height: 11 }} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--navy-700)', lineHeight: 1.5, fontFamily: FONT }}>{c.text}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add comment */}
            <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                style={{ ...inp, flex: 1, minHeight: 60, resize: 'none' }}
                placeholder="Write a comment..."
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
              />
              <button
                onClick={handleComment}
                disabled={postingComment || !newComment.trim()}
                style={{
                  padding: '0.5rem 0.9rem', background: 'var(--accent-500)', border: 'none', borderRadius: 8,
                  color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: '0.8rem',
                  opacity: !newComment.trim() ? 0.5 : 1,
                }}
              >
                Post
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Admin Reply Modal ─────────────────────────────────────────────── */}
      {replyTarget && ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="db-card" style={{ width: '100%', maxWidth: 460, padding: '1.5rem', animation: 'fadeInUp 0.2s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--navy-900)', fontFamily: FONT }}>Official Response</h3>
              <button onClick={() => setReplyTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', display: 'flex' }}>
                <XMarkIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--navy-600)', marginBottom: 12, fontFamily: FONT }}>
              Replying to: <strong>{replyTarget.title}</strong>
            </div>
            <textarea
              style={{ ...inp, minHeight: 100, resize: 'vertical', marginBottom: 12 }}
              placeholder="Your official response..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setReplyTarget(null)} style={{ padding: '0.5rem 1rem', border: '1.5px solid var(--navy-200)', borderRadius: 8, background: 'transparent', color: 'var(--navy-600)', cursor: 'pointer', fontFamily: FONT, fontSize: '0.82rem', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleReply} style={{ padding: '0.5rem 1rem', background: 'var(--accent-500)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: '0.82rem' }}>
                Publish Reply
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default Suggestions;
