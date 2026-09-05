import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckIcon, XMarkIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, FunnelIcon,
} from '@heroicons/react/24/outline';

const API = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open:      { label: 'Open',      color: '#0891b2', bg: '#ecfeff' },
  completed: { label: 'Completed', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2' },
};

const AdminManifestOps: React.FC = () => {
  const { token } = useAuth() as any;
  const authH = { Authorization: `Bearer ${token}` };

  const [jobs,     setJobs]     = useState<any[]>([]);
  const [jobsLoad, setJobsLoad] = useState(true);
  const [stats,    setStats]    = useState<any>({});
  const [statusF,  setStatusF]  = useState('');
  const [carrierF, setCarrierF] = useState('');
  const [jobPage,  setJobPage]  = useState(1);
  const [jobPages, setJobPages] = useState(1);
  const [jobTotal, setJobTotal] = useState(0);

  // Modal state
  const [modal, setModal] = useState<{ type: 'upload' | 'cancel'; job: any } | null>(null);
  const [reason, setReason] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchJobs = useCallback(async () => {
    setJobsLoad(true);
    try {
      const params: any = { page: jobPage, limit: 20 };
      if (statusF)  params.status  = statusF;
      if (carrierF) params.carrier = carrierF;
      const [{ data: jd }, { data: sd }] = await Promise.all([
        axios.get(`${API}/admin/manifest`, { headers: authH, params }),
        axios.get(`${API}/admin/manifest/stats`, { headers: authH }),
      ]);
      setJobs(jd.jobs);
      setJobPages(jd.pages);
      setJobTotal(jd.total);
      setStats(sd);
    } catch { }
    setJobsLoad(false);
  }, [token, jobPage, statusF, carrierF]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const openUploadModal = (job: any) => {
    setModal({ type: 'upload', job });
    setUploadFile(null);
    setActionError('');
  };

  const submitUpload = async () => {
    if (!modal) return;
    if (!uploadFile) { setActionError('Choose a file to upload'); return; }
    setActionLoading(true);
    setActionError('');
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      await axios.post(`${API}/admin/manifest/${modal.job._id}/upload-result`, form, {
        headers: { ...authH, 'Content-Type': 'multipart/form-data' },
      });
      setModal(null);
      setUploadFile(null);
      fetchJobs();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Upload failed');
    } finally {
      setActionLoading(false);
    }
  };

  const submitCancel = async () => {
    if (!modal) return;
    setActionLoading(true);
    setActionError('');
    try {
      await axios.put(`${API}/admin/manifest/${modal.job._id}/cancel`, { reason }, { headers: authH });
      setModal(null);
      setReason('');
      fetchJobs();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Manifest Operations</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>Review manifest requests, produce the labels, and upload the result for each job</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total',     value: stats.total     ?? 0, color: '#334155' },
          { label: 'Open',      value: stats.open      ?? 0, color: '#0891b2' },
          { label: 'Completed', value: stats.completed ?? 0, color: '#059669' },
          { label: 'Cancelled', value: stats.cancelled ?? 0, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} className="sh-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <FunnelIcon style={{ width: 16, height: 16, color: '#94a3b8' }} />
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setJobPage(1); }} className="form-input form-select" style={{ width: 170 }}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={carrierF} onChange={e => { setCarrierF(e.target.value); setJobPage(1); }} className="form-input form-select" style={{ width: 130 }}>
          <option value="">All Carriers</option>
          {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: '0.82rem', color: '#94a3b8', marginLeft: 4 }}>{jobTotal} jobs</span>
      </div>

      {jobsLoad ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading…</div>
      ) : (
        <div className="sh-card" style={{ overflow: 'hidden' }}>
          <table className="sh-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>User</th>
                <th>Carrier</th>
                <th>Labels</th>
                <th>User Paid</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: any) => {
                const sm = STATUS_META[job.status] || { label: job.status, color: '#64748b', bg: '#f1f5f9' };
                const canUpload = job.status !== 'cancelled';
                const canCancel = job.status === 'open';
                return (
                  <tr key={job._id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>
                      {job._id.slice(-8).toUpperCase()}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                        {job.user?.firstName} {job.user?.lastName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{job.user?.email}</div>
                    </td>
                    <td><span className="carrier-badge usps">{job.carrier}</span></td>
                    <td style={{ fontWeight: 600 }}>{job.requestFile?.labelCount ?? '—'}</td>
                    <td style={{ fontWeight: 600, color: '#dc2626', fontSize: '0.85rem' }}>
                      ${(job.userBilling?.totalAmount ?? 0).toFixed(2)}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: 99,
                        fontSize: '0.7rem', fontWeight: 600, background: sm.bg, color: sm.color,
                      }}>{sm.label}</span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {/* Download request file */}
                        <button
                          onClick={() => window.open(`${API}/admin/manifest/${job._id}/download-request?token=${token}`, '_blank')}
                          className="btn btn-ghost btn-sm" title="Download request CSV"
                          style={{ padding: '4px 8px' }}>
                          <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
                        </button>
                        {/* Download result file */}
                        {job.status === 'completed' && (
                          <button
                            onClick={() => window.open(`${API}/admin/manifest/${job._id}/download-result?token=${token}`, '_blank')}
                            className="btn btn-success btn-sm" title="Download uploaded result"
                            style={{ padding: '4px 8px' }}>
                            <CheckIcon style={{ width: 13, height: 13 }} />
                          </button>
                        )}
                        {/* Upload / replace result */}
                        {canUpload && (
                          <button onClick={() => openUploadModal(job)}
                            className="btn btn-primary btn-sm" title={job.status === 'completed' ? 'Replace result file' : 'Upload result'}>
                            <ArrowUpTrayIcon style={{ width: 13, height: 13, marginRight: 4 }} />
                            {job.status === 'completed' ? 'Replace' : 'Upload'}
                          </button>
                        )}
                        {/* Cancel */}
                        {canCancel && (
                          <button onClick={() => { setModal({ type: 'cancel', job }); setReason(''); setActionError(''); }}
                            className="btn btn-ghost btn-sm" title="Cancel" style={{ color: '#dc2626' }}>
                            <XMarkIcon style={{ width: 13, height: 13 }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {jobPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '1rem' }}>
              <button disabled={jobPage === 1}         onClick={() => setJobPage(p => p - 1)} className="btn btn-ghost btn-sm">Prev</button>
              <span style={{ lineHeight: '32px', fontSize: '0.85rem', color: '#64748b' }}>{jobPage} / {jobPages}</span>
              <button disabled={jobPage === jobPages}  onClick={() => setJobPage(p => p + 1)} className="btn btn-ghost btn-sm">Next</button>
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL ────────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title" style={{ textTransform: 'capitalize' }}>
              {modal.type === 'upload' ? 'Upload Result' : 'Cancel'} Job #{modal.job._id.slice(-8).toUpperCase()}
            </h3>

            {actionError && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{actionError}</div>}

            {modal.type === 'upload' && (
              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Result File (ZIP, PDF, or CSV) *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.pdf,.csv"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  className="form-input"
                />
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 6 }}>
                  Uploading this file immediately completes the job — the user is notified and can download it right away.
                </p>
              </div>
            )}

            {modal.type === 'cancel' && (
              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Notes (optional)</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="form-input"
                  rows={3}
                  placeholder="Optional notes…"
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} className="btn btn-ghost" disabled={actionLoading}>Close</button>
              <button
                onClick={() => modal.type === 'upload' ? submitUpload() : submitCancel()}
                disabled={actionLoading}
                className={`btn ${modal.type === 'upload' ? 'btn-primary' : 'btn-danger'}`}
              >
                {actionLoading ? 'Processing…' : modal.type === 'upload' ? 'Upload & Complete' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManifestOps;
