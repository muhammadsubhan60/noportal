import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  ClipboardDocumentIcon, CheckCircleIcon,
  XMarkIcon, SparklesIcon, ArrowRightIcon, ExclamationTriangleIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const API_BASE = process.env.REACT_APP_API_URL
  || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const VALID_STATUSES = [
  'Not Scanned Yet', 'In Transit', 'Out for Delivery', 'Delivered',
  'Exception / Problem', 'Returned to Sender', 'Pending Pickup', 'Delayed',
];

const STATUS_NORMALIZE: Record<string, string> = {
  'not scanned yet': 'Not Scanned Yet', 'not_scanned_yet': 'Not Scanned Yet',
  'not scanned': 'Not Scanned Yet', 'not_scanned': 'Not Scanned Yet',
  'in transit': 'In Transit', 'in_transit': 'In Transit', 'intransit': 'In Transit',
  'out for delivery': 'Out for Delivery', 'out_for_delivery': 'Out for Delivery',
  'delivered': 'Delivered',
  'exception / problem': 'Exception / Problem', 'exception/problem': 'Exception / Problem',
  'exception_problem': 'Exception / Problem', 'exception problem': 'Exception / Problem',
  'exception': 'Exception / Problem',
  'returned to sender': 'Returned to Sender', 'returned_to_sender': 'Returned to Sender',
  'return to sender': 'Returned to Sender', 'return_to_sender': 'Returned to Sender',
  'pending pickup': 'Pending Pickup', 'pending_pickup': 'Pending Pickup',
  'delayed': 'Delayed',
};

const PROMPT_TEMPLATE = `You are a shipping tracking status classifier. Given USPS tracking information, classify each tracking number into exactly one of the valid statuses.

Return ONLY a CSV with two columns: tracking_number,status
No headers, no explanation, no markdown — raw CSV rows only.

Valid status values (copy exactly as written):
${VALID_STATUSES.map(s => `- ${s}`).join('\n')}

Tracking data to classify:
[PASTE YOUR TRACKING DATA BELOW — then send to ChatGPT or Claude]`;

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'Not Scanned Yet':     { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' },
  'In Transit':          { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  'Out for Delivery':    { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  'Delivered':           { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  'Exception / Problem': { bg: '#FFF5F5', color: '#DC2626', border: '#FECACA' },
  'Returned to Sender':  { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
  'Pending Pickup':      { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  'Delayed':             { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
};

const STATUS_TO_KEY: Record<string, string> = {
  'Not Scanned Yet':     'not_scanned_yet',
  'In Transit':          'in_transit',
  'Out for Delivery':    'out_for_delivery',
  'Delivered':           'delivered',
  'Exception / Problem': 'exception_problem',
  'Returned to Sender':  'returned_to_sender',
  'Pending Pickup':      'pending_pickup',
  'Delayed':             'delayed',
};

interface ParsedRow {
  trackingId: string; rawStatus: string; normalizedStatus: string | null; valid: boolean;
}

function parseCsv(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) continue;
    const trackingId   = line.slice(0, commaIdx).trim();
    const rawStatus    = line.slice(commaIdx + 1).trim().replace(/^"|"$/g, '');
    const normalized   = STATUS_NORMALIZE[rawStatus.toLowerCase()] || null;
    if (!trackingId) continue;
    rows.push({ trackingId, rawStatus, normalizedStatus: normalized, valid: !!normalized });
  }
  return rows;
}

interface ApplyResult { updated: number; alreadySame: number; notFound: number; notFoundIds: string[]; }

export default function CCBulkTrackingUpdate() {
  const { token } = useAuth();
  const fileRef   = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  const [copied,    setCopied]    = useState(false);
  const [csvText,   setCsvText]   = useState('');
  const [previewed, setPreviewed] = useState(false);
  const [parsed,    setParsed]    = useState<ParsedRow[]>([]);
  const [parseErr, setParseErr] = useState<string[]>([]);
  const [confirm,  setConfirm]  = useState(false);
  const [applying, setApplying] = useState(false);
  const [result,   setResult]   = useState<ApplyResult | null>(null);

  useEffect(() => {
    if (previewed) reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [previewed]);

  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(PROMPT_TEMPLATE); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText(String(ev.target?.result || ''));
    reader.readAsText(f);
  };

  const preview = () => {
    console.log('[AI Status Update] Preview clicked. csvText:', JSON.stringify(csvText.slice(0, 200)), 'length:', csvText.length);
    try {
      const rows = parseCsv(csvText);
      const errs = rows.filter(r => !r.valid).map(r => `"${r.rawStatus}" on tracking ${r.trackingId}`);
      console.log('[AI Status Update] Parsed', rows.length, 'row(s), ', errs.length, 'invalid:', rows);
      setParsed(rows.slice(0, 1000));
      setParseErr(errs.slice(0, 20));
      setResult(null);
      setPreviewed(true);
      console.log('[AI Status Update] State set: previewed=true');
    } catch (err) {
      console.error('[AI Status Update] preview() threw an error:', err);
    }
  };

  const apply = async () => {
    const updates = parsed
      .filter(r => r.valid && r.normalizedStatus)
      .map(r => ({ tracking: r.trackingId, status: STATUS_TO_KEY[r.normalizedStatus!] }));
    if (!updates.length) return;

    setApplying(true);
    setConfirm(false);
    try {
      const r = await axios.post(
        `${API_BASE}/labels/bulk-status-by-tracking`,
        { updates },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setResult(r.data);
    } catch (e: any) {
      setResult({ updated: 0, alreadySame: 0, notFound: 0, notFoundIds: [], ...e.response?.data });
    }
    setApplying(false);
  };

  const reset = () => { setCsvText(''); setPreviewed(false); setParsed([]); setParseErr([]); setResult(null); setConfirm(false); };

  const validRows    = parsed.filter(r => r.valid);
  const statusGroups = validRows.reduce<Record<string, number>>((acc, r) => {
    const k = r.normalizedStatus!;
    acc[k]  = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ padding: '1.5rem', fontFamily: FONT, maxWidth: 900, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--navy-900)', margin: 0, letterSpacing: '-0.4px' }}>AI Status Update</h1>
          <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: 99 }}>Beta</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', marginTop: 3 }}>Bulk-update tracking statuses using AI-classified CSV output</div>
      </div>

      {/* ── Copy prompt + paste result, one flow ────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="db-card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <SparklesIcon style={{ width: 18, height: 18, color: '#6366f1' }} />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy-900)' }}>Copy the Prompt, Paste the Result</span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--navy-500)', lineHeight: 1.6, marginBottom: 18 }}>
            Copy the prompt below and paste it into <strong>ChatGPT</strong> or <strong>Claude</strong> along with your USPS tracking data. Then paste the CSV it hands back into the box underneath — all on this one page.
          </p>

          {/* Copy prompt row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            padding: '1rem 1.2rem', borderRadius: 12, marginBottom: '1.4rem',
            background: 'var(--navy-50)', border: '1.5px solid var(--navy-200)',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', fontFamily: FONT }}>1</span>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-800)' }}>Copy the classification prompt</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 2 }}>Paste into ChatGPT or Claude, plus your tracking page content</div>
            </div>
            <button onClick={copyPrompt} style={{
              display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
              padding: '0.55rem 1.1rem', borderRadius: 9, border: 'none',
              background: copied ? '#22c55e' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
              color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
              transition: 'background 0.2s',
            }}>
              {copied
                ? <><CheckCircleIcon style={{ width: 15, height: 15 }} /> Copied!</>
                : <><ClipboardDocumentIcon style={{ width: 15, height: 15 }} /> Copy Prompt</>
              }
            </button>
          </div>

          {/* Paste result */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', fontFamily: FONT }}>2</span>
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-800)' }}>Paste the AI's CSV output</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: 2 }}>Or upload a .csv file · max 1,000 rows</div>
            </div>
          </div>

          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={"9400111899223397993164,Delivered\n9400111899223397993171,In Transit\n..."}
            style={{ width: '100%', minHeight: 190, padding: '0.8rem', background: 'var(--navy-50)', border: '1.5px solid var(--navy-200)', borderRadius: 10, fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--navy-800)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--navy-400)' }}>{parseCsv(csvText).length} rows detected</span>
              <span style={{ color: 'var(--navy-200)' }}>·</span>
              <button onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: '0.78rem', fontWeight: 600, fontFamily: FONT }}>
                <ArrowUpTrayIcon style={{ width: 13, height: 13 }} /> Upload .csv instead
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFileChange} style={{ display: 'none' }} />
            </div>

            <button
              onClick={preview}
              disabled={!csvText.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.6rem 1.3rem', borderRadius: 9, background: csvText.trim() ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'var(--navy-200)', border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: csvText.trim() ? 'pointer' : 'not-allowed', fontFamily: FONT }}>
              Preview Updates <ArrowRightIcon style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* ── Review & Apply — appears below once you've previewed ── */}
        {previewed && (
          <div ref={reviewRef}>
          {/* Summary */}
          <div className="db-card" style={{ padding: '1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <CheckCircleIcon style={{ width: 18, height: 18, color: '#22c55e' }} />
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy-900)' }}>Review & Apply</span>
            </div>

            {parsed.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.8rem 1rem', borderRadius: 9, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 4 }}>
                <ExclamationTriangleIcon style={{ width: 15, height: 15, color: '#dc2626', flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', color: '#dc2626' }}>
                  No rows detected. Make sure each line looks like <code>tracking_number,status</code>.
                </span>
              </div>
            ) : (
            <>
            <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ padding: '0.7rem 1.1rem', borderRadius: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#6366f1', lineHeight: 1 }}>{parsed.length}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#6366f1', marginTop: 3 }}>Total rows</div>
              </div>
              <div style={{ padding: '0.7rem 1.1rem', borderRadius: 10, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', lineHeight: 1 }}>{validRows.length}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#15803d', marginTop: 3 }}>Valid rows</div>
              </div>
              {parseErr.length > 0 && (
                <div style={{ padding: '0.7rem 1.1rem', borderRadius: 10, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>{parseErr.length}</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#dc2626', marginTop: 3 }}>Errors</div>
                </div>
              )}
            </div>

            {/* Status breakdown */}
            {Object.keys(statusGroups).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {Object.entries(statusGroups).map(([st, cnt]) => {
                  const cfg = STATUS_STYLE[st] || { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
                  return (
                    <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>{cnt}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{st}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Parse errors */}
            {parseErr.length > 0 && (
              <div style={{ marginBottom: 14, padding: '0.7rem 1rem', borderRadius: 9, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <ExclamationTriangleIcon style={{ width: 14, height: 14, color: '#dc2626' }} />
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626' }}>Parse errors (rows will be skipped)</span>
                </div>
                {parseErr.map((e, i) => <div key={i} style={{ fontSize: '0.7rem', color: '#dc2626', fontFamily: 'monospace' }}>{e}</div>)}
              </div>
            )}

            {/* Actions */}
            {!result && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setConfirm(true)}
                  disabled={validRows.length === 0 || applying}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0.55rem 1.2rem', borderRadius: 9, background: validRows.length > 0 ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'var(--navy-200)', border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: validRows.length > 0 ? 'pointer' : 'not-allowed', fontFamily: FONT }}>
                  {applying ? 'Applying…' : `Apply ${validRows.length} Updates`}
                </button>
              </div>
            )}
            </>
            )}
          </div>

          {/* Preview table */}
          {parsed.length > 0 && !result && (
            <div className="db-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '0.9rem 1.1rem', borderBottom: '1.5px solid var(--navy-100)', fontSize: '0.67rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Preview (first 200 rows)
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: FONT }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                    <tr style={{ borderBottom: '1.5px solid var(--navy-200)' }}>
                      {['#', 'Tracking Number', 'Raw Status', 'Normalized'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '0.63rem', fontWeight: 700, color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 200).map((row, i) => {
                      const cfg = row.normalizedStatus ? (STATUS_STYLE[row.normalizedStatus] || {}) : {};
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--navy-100)', background: !row.valid ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--navy-400)', fontSize: '0.7rem' }}>{i + 1}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--navy-700)' }}>{row.trackingId}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--navy-600)' }}>{row.rawStatus}</td>
                          <td style={{ padding: '6px 10px' }}>
                            {row.valid && row.normalizedStatus ? (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: (cfg as any).bg, color: (cfg as any).color, border: `1px solid ${(cfg as any).border}` }}>{row.normalizedStatus}</span>
                            ) : (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <XMarkIcon style={{ width: 11, height: 11 }} /> Invalid
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result card */}
          {result && (
            <div className="db-card" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                <CheckCircleIcon style={{ width: 18, height: 18, color: '#22c55e' }} />
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy-900)' }}>Update Complete</span>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ padding: '0.7rem 1.1rem', borderRadius: 10, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', lineHeight: 1 }}>{result.updated}</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#15803d', marginTop: 3 }}>Updated</div>
                </div>
                <div style={{ padding: '0.7rem 1.1rem', borderRadius: 10, background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.2)' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#64748b', lineHeight: 1 }}>{result.alreadySame}</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b', marginTop: 3 }}>Already same</div>
                </div>
                <div style={{ padding: '0.7rem 1.1rem', borderRadius: 10, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>{result.notFound}</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#dc2626', marginTop: 3 }}>Not found</div>
                </div>
              </div>
              {result.notFoundIds?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-500)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Not found IDs</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {result.notFoundIds.slice(0, 20).map(id => (
                      <span key={id} style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#dc2626', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 5, padding: '2px 6px' }}>{id}</span>
                    ))}
                    {result.notFoundIds.length > 20 && <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', padding: '2px' }}>+{result.notFoundIds.length - 20} more</span>}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(result.notFoundIds.join('\n'))}
                    style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: '0.76rem', fontWeight: 600, fontFamily: FONT }}
                  >
                    <ClipboardDocumentIcon style={{ width: 13, height: 13 }} /> Copy all not-found IDs
                  </button>
                </div>
              )}
              <button onClick={reset} style={{ padding: '0.55rem 1.2rem', borderRadius: 9, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                Start new update
              </button>
            </div>
          )}
          </div>
        )}
      </div>

      {/* ── Confirm modal ─────────────────────────────────────── */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)' }}>
          <div className="db-card" style={{ padding: '1.5rem', width: 420, maxWidth: '92vw' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: 10, fontFamily: FONT }}>Confirm Update</div>
            <p style={{ fontSize: '0.82rem', color: 'var(--navy-600)', lineHeight: 1.6, marginBottom: 18 }}>
              You're about to update <strong>{validRows.length} tracking numbers</strong>. This will overwrite existing statuses and cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirm(false)} style={{ padding: '0.55rem 1rem', borderRadius: 9, background: 'var(--navy-100)', border: '1px solid var(--navy-200)', color: 'var(--navy-700)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>Cancel</button>
              <button onClick={apply} style={{ padding: '0.55rem 1.2rem', borderRadius: 9, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                Confirm — Apply {validRows.length} Updates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
