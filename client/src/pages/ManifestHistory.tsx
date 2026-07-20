import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { ArrowDownTrayIcon, ArrowPathIcon, XMarkIcon, FunnelIcon } from '@heroicons/react/24/outline';

const API = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:      { label: 'Pending',        color: '#64748b', bg: '#f1f5f9' },
  open:         { label: 'Open',           color: '#0891b2', bg: '#ecfeff' },
  assigned:     { label: 'Assigned',       color: '#d97706', bg: '#fffbeb' },
  accepted:     { label: 'In Progress',    color: '#2563eb', bg: '#eff6ff' },
  uploaded:     { label: 'Uploaded',       color: '#7c3aed', bg: '#f5f3ff' },
  under_review: { label: 'Under Review',   color: '#6366f1', bg: '#eef2ff' },
  completed:    { label: 'Completed',      color: '#059669', bg: '#ecfdf5' },
  cancelled:    { label: 'Cancelled',      color: '#dc2626', bg: '#fef2f2' },
  rejected:     { label: 'Rejected',       color: '#ea580c', bg: '#fff7ed' },
};

const CANCELLABLE = ['open', 'pending', 'assigned'];

const ManifestHistory: React.FC = () => {
  const { token } = useAuth() as any;
  const [jobs,       setJobs]       = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [total,      setTotal]      = useState(0);
  const [statusF,    setStatusF]    = useState('');
  const [carrierF,   setCarrierF]   = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const authH = { Authorization: `Bearer ${token}` };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 15 };
      if (statusF)  params.status  = statusF;
      if (carrierF) params.carrier = carrierF;
      const { data } = await axios.get(`${API}/manifest`, { headers: authH, params });
      setJobs(data?.jobs ?? []);
      setPages(data?.pages ?? 1);
      setTotal(data?.total ?? 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, page, statusF, carrierF]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleDownload = (jobId: string) => {
    window.open(`${API}/manifest/${jobId}/download?token=${token}`, '_blank');
  };

  const handleCancel = async (jobId: string) => {
    if (!window.confirm('Cancel this job? Your balance will be refunded.')) return;
    setCancelling(jobId);
    try {
      await axios.patch(`${API}/manifest/${jobId}/cancel`, {}, { headers: authH });
      fetchJobs();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to cancel job');
    } finally {
      setCancelling(null);
    }
  };

  const th: React.CSSProperties = { fontSize: '0.7rem', padding: '6px 10px', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { fontSize: '0.78rem', padding: '5px 10px' };

  return (
    <div className="animate-fadeIn">
      {/* Header + filters in one tight row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Manifest History</h1>
        </div>
        <FunnelIcon style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0 }} />
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }}
          className="form-input form-select" style={{ width: 140, fontSize: '0.78rem', padding: '4px 8px' }}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={carrierF} onChange={e => { setCarrierF(e.target.value); setPage(1); }}
          className="form-input form-select" style={{ width: 110, fontSize: '0.78rem', padding: '4px 8px' }}>
          <option value="">All Carriers</option>
          {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{total} job{total !== 1 ? 's' : ''}</span>
        <button className="btn btn-ghost btn-sm" onClick={fetchJobs} style={{ padding: '3px 8px' }}>
          <ArrowPathIcon style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="sh-card" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
          No manifest jobs found.
        </div>
      ) : (
        <div className="sh-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <th style={th}>Job ID</th>
                <th style={th}>Carrier</th>
                <th style={th}>Labels</th>
                <th style={th}>Paid</th>
                <th style={th}>Status</th>
                <th style={th}>Vendor</th>
                <th style={th}>Date</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: any, idx: number) => {
                const sm = STATUS_META[job.status] || { label: job.status, color: '#64748b', bg: '#f1f5f9' };
                const canCancel   = CANCELLABLE.includes(job.status);
                const canDownload = job.status === 'completed';
                return (
                  <tr key={job._id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...td, fontFamily: 'monospace', color: '#475569' }}>
                      {job._id.slice(-8).toUpperCase()}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#004b87', color: '#fff' }}>
                        {job.carrier}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 600, textAlign: 'center' }}>
                      {job.requestFile?.labelCount ?? job.userBilling?.labelCount ?? '—'}
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: '#dc2626' }}>
                      ${(job.userBilling?.totalAmount ?? 0).toFixed(2)}
                    </td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 99,
                        fontSize: '0.65rem', fontWeight: 600,
                        background: sm.bg, color: sm.color, whiteSpace: 'nowrap',
                      }}>
                        {sm.label}
                      </span>
                    </td>
                    <td style={{ ...td, color: '#475569', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.vendor?.name ?? '—'}
                    </td>
                    <td style={{ ...td, color: '#64748b', whiteSpace: 'nowrap' }}>
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ ...td }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {canDownload && (
                          <button onClick={() => handleDownload(job._id)}
                            className="btn btn-success btn-sm" title="Download labels"
                            style={{ padding: '3px 7px' }}>
                            <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
                          </button>
                        )}
                        {canCancel && (
                          <button onClick={() => handleCancel(job._id)}
                            disabled={cancelling === job._id}
                            className="btn btn-ghost btn-sm" title="Cancel job"
                            style={{ padding: '3px 7px', color: '#dc2626' }}>
                            <XMarkIcon style={{ width: 13, height: 13 }} />
                          </button>
                        )}
                        {!canDownload && !canCancel && (
                          <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '0.6rem' }}>
              <button disabled={page === 1}     onClick={() => setPage(p => p - 1)} className="btn btn-ghost btn-sm">Prev</button>
              <span style={{ lineHeight: '28px', fontSize: '0.78rem', color: '#64748b' }}>{page} / {pages}</span>
              <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="btn btn-ghost btn-sm">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ManifestHistory;
