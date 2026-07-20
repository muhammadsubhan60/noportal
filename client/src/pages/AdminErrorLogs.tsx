import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ExclamationTriangleIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { useSocket } from '../contexts/SocketContext';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const SOURCE_LABELS: Record<string, string> = {
  'single-label':            'Single Label',
  'single-labelcrow-config': 'Single · Label Crow Config',
  'single-shiplabel-config': 'Single · ShipLabel Config',
  'bulk-labelcrow-config':   'Bulk · Label Crow Config',
  'bulk-labelcrow-submit':   'Bulk · Label Crow Submit',
  'bulk-labelcrow-job':      'Bulk · Label Crow Job',
  'bulk-shiplabel-row':      'Bulk · ShipLabel Row',
  'bulk-shippershub-row':    'Bulk · ShippersHub Row',
  'bulk-generic':            'Bulk · Unexpected Error',
};

const PORTAL_LABELS: Record<string, string> = {
  shippershub: 'ShippersHub', labelcrow: 'Label Crow', shiplabel: 'ShipLabel', manual: 'Manual',
};

interface ErrorLogUser { _id: string; firstName: string; lastName: string; email: string; role: string; }
interface ErrorLogEntry {
  _id: string;
  user: ErrorLogUser | null;
  carrier: string;
  vendorName: string;
  portal: string | null;
  isBulk: boolean;
  bulkJobId: string | null;
  source: string;
  message: string;
  httpStatus: number | null;
  createdAt: string;
}

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'];
const PORTALS  = ['shippershub', 'labelcrow', 'shiplabel'];

const AdminErrorLogs: React.FC = () => {
  const { socket } = useSocket();

  const [logs,     setLogs]     = useState<ErrorLogEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [page,     setPage]     = useState(1);
  const [pages,    setPages]    = useState(1);
  const [total,    setTotal]    = useState(0);
  const [summary,  setSummary]  = useState<{ last24h: number; total: number } | null>(null);

  const [carrierFilter, setCarrierFilter] = useState('');
  const [portalFilter,  setPortalFilter]  = useState('');
  const [typeFilter,    setTypeFilter]    = useState<'' | 'single' | 'bulk'>('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (carrierFilter) params.carrier = carrierFilter;
      if (portalFilter)  params.portal  = portalFilter;
      if (typeFilter)    params.isBulk  = typeFilter === 'bulk' ? 'true' : 'false';
      const { data } = await axios.get('/error-logs', { params });
      setLogs(data.logs || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load error logs');
    } finally {
      setLoading(false);
    }
  }, [page, carrierFilter, portalFilter, typeFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    axios.get('/error-logs/summary').then(({ data }) => setSummary(data)).catch(() => {});
  }, [logs]);

  // Live push — new failures appear at the top instantly while viewing page 1 with no filters
  useEffect(() => {
    if (!socket) return;
    const handler = (data: any) => {
      if (page !== 1 || carrierFilter || portalFilter || typeFilter) return;
      setLogs(prev => [{
        _id: data._id, user: null, carrier: data.carrier, vendorName: data.vendorName,
        portal: data.portal, isBulk: data.isBulk, bulkJobId: null, source: data.source,
        message: data.message, httpStatus: null, createdAt: data.createdAt,
      }, ...prev].slice(0, 50));
      setTotal(t => t + 1);
    };
    socket.on('admin-label-failed', handler);
    return () => { socket.off('admin-label-failed', handler); };
  }, [socket, page, carrierFilter, portalFilter, typeFilter]);

  const resetFilters = () => { setCarrierFilter(''); setPortalFilter(''); setTypeFilter(''); setPage(1); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontFamily: FONT }} className="animate-fadeIn">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExclamationTriangleIcon style={{ width: 20, height: 20, color: '#DC2626' }} />
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.02em', fontFamily: FONT }}>
              Logs &amp; Errors
            </h1>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99, fontFamily: FONT }}>
              Admin only
            </span>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--navy-400)', margin: '4px 0 0', fontFamily: FONT }}>
            Every real label-generation failure — single and bulk. Never shown to users.
          </p>
        </div>
        {summary && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="db-card" style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last 24h</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: summary.last24h > 0 ? '#DC2626' : 'var(--navy-800)' }}>{summary.last24h}</div>
            </div>
            <div className="db-card" style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>All-Time</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--navy-800)' }}>{summary.total}</div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="db-card" style={{ padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <FunnelIcon style={{ width: 14, height: 14, color: 'var(--navy-400)', flexShrink: 0 }} />
        <select className="form-input" value={carrierFilter} onChange={e => { setCarrierFilter(e.target.value); setPage(1); }} style={{ height: 32, fontSize: '0.78rem', padding: '0 1.6rem 0 0.6rem' }}>
          <option value="">All carriers</option>
          {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-input" value={portalFilter} onChange={e => { setPortalFilter(e.target.value); setPage(1); }} style={{ height: 32, fontSize: '0.78rem', padding: '0 1.6rem 0 0.6rem' }}>
          <option value="">All portals</option>
          {PORTALS.map(p => <option key={p} value={p}>{PORTAL_LABELS[p]}</option>)}
        </select>
        <select className="form-input" value={typeFilter} onChange={e => { setTypeFilter(e.target.value as any); setPage(1); }} style={{ height: 32, fontSize: '0.78rem', padding: '0 1.6rem 0 0.6rem' }}>
          <option value="">Single + Bulk</option>
          <option value="single">Single only</option>
          <option value="bulk">Bulk only</option>
        </select>
        {(carrierFilter || portalFilter || typeFilter) && (
          <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ fontFamily: FONT }}>Clear filters</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--navy-400)', fontFamily: FONT }}>{total} total</span>
      </div>

      {/* Table */}
      <div className="db-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2.5rem', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>
        ) : error ? (
          <div style={{ padding: '1rem 1.1rem', color: 'var(--danger-600)', fontSize: '0.82rem', fontWeight: 600 }}>{error}</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--navy-400)', fontSize: '0.85rem', fontFamily: FONT }}>
            No failures logged{(carrierFilter || portalFilter || typeFilter) ? ' for this filter' : ''}. Clean run.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>Time</th><th>User</th><th>Carrier</th><th>Portal</th><th>Vendor</th><th>Type</th><th>Source</th><th>Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log._id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                      {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ fontSize: '0.77rem', whiteSpace: 'nowrap' }}>
                      {log.user ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{log.user.firstName} {log.user.lastName}</div>
                          <div style={{ color: 'var(--navy-400)', fontSize: '0.68rem' }}>{log.user.email}</div>
                        </>
                      ) : <span style={{ color: 'var(--navy-400)' }}>—</span>}
                    </td>
                    <td>
                      {log.carrier ? <span className={`carrier-badge ${log.carrier.toLowerCase()}`}>{log.carrier}</span> : '—'}
                    </td>
                    <td style={{ fontSize: '0.77rem' }}>{log.portal ? PORTAL_LABELS[log.portal] || log.portal : '—'}</td>
                    <td style={{ fontSize: '0.77rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.vendorName}>
                      {log.vendorName || '—'}
                    </td>
                    <td>
                      <span className="badge" style={{ background: log.isBulk ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)', color: log.isBulk ? '#6366f1' : '#059669', fontSize: '0.65rem', fontWeight: 700 }}>
                        {log.isBulk ? 'Bulk' : 'Single'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{SOURCE_LABELS[log.source] || log.source}</td>
                    <td style={{ fontSize: '0.75rem', maxWidth: 340, color: 'var(--danger-600)' }} title={log.message}>
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0.75rem', borderTop: '1px solid var(--navy-100)' }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
            <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)', fontFamily: FONT }}>Page {page} of {pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminErrorLogs;
