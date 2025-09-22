import React, { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import API from '../utils/apiConfig';

export default function Mailchimp() {
  const [file, setFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewHeader, setPreviewHeader] = useState([]);
  const [totalRows, setTotalRows] = useState(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [invalidEmails, setInvalidEmails] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const pollingRef = useRef(null);

  const audienceId = '1590941';
  const requiredColumns = ['email'];

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => {
    if (!taskId) return;
    // poll task status every 2s
    pollingRef.current = setInterval(async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
        const res = await fetch(`${API}/api/v1/mailchimp/import-tasks?page=1&per_page=1`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        if (!res.ok) return;
        const b = await res.json();
        const t = (b.data || []).find(x => x.id === taskId);
        if (t) setTaskStatus(t.status);
        if (t && (t.status === 'completed' || t.status === 'failed')) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          fetchLogs();
        }
      } catch (e) { /* ignore */ }
    }, 2000);

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [taskId]);

  const fetchLogs = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const res = await fetch(`${API}/api/v1/mailchimp/import-logs?page=1&per_page=10`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (!res.ok) return;
      const b = await res.json();
      setLogs(b.data || []);
    } catch (e) { console.warn(e); }
  };

  const handleFileChange = (e) => {
    setMessage('');
    setFile(null);
    setPreviewRows([]); setPreviewHeader([]); setTotalRows(null); setDuplicateCount(0); setInvalidEmails(0);
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);

    // Stream-parse entire file using PapaParse step callback so we can detect duplicates across all rows
    const MAX_PREVIEW_ROWS = 50000; // safety cap to avoid OOM in browser; if exceeded we'll stop storing rows but still compute counts
    let rowsAcc = [];
    let headerFields = null;
    let total = 0;
    const seen = new Set();
    const dupMap = new Map();
    let invalid = 0;
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      step: function(result, parser) {
        // result.data is an object when header:true
        if (!headerFields && result.meta && result.meta.fields) {
          headerFields = result.meta.fields;
          setPreviewHeader(headerFields);
        }

        const row = result.data || {};
        total++;

        // email normalization for duplicate detection
        const email = (row.email || row.Email || '').toString().trim();
        if (email) {
          const e = email.toLowerCase();
          if (seen.has(e)) {
            dupMap.set(e, (dupMap.get(e) || 1) + 1);
          } else {
            seen.add(e);
          }
          if (!emailRegex.test(email)) invalid++;
        }

        // Accumulate rows for preview up to MAX_PREVIEW_ROWS
        if (rowsAcc.length < MAX_PREVIEW_ROWS) rowsAcc.push(row);
        // batch update state every 250 rows to avoid too many re-renders
        if (rowsAcc.length >= 250) {
          const batch = rowsAcc.splice(0, rowsAcc.length);
          setPreviewRows(prev => prev.concat(batch));
        }
      },
      complete: function() {
  // flush remaining rows
  if (rowsAcc.length) setPreviewRows(prev => prev.concat(rowsAcc));
  setTotalRows(total);
  // reset pagination to first page when new file loaded
  setCurrentPage(1);
        // duplicate count: total duplicate occurrences (count of extras)
        const dupCount = Array.from(dupMap.values()).reduce((a, b) => a + b, 0);
        setDuplicateCount(dupCount);
        setInvalidEmails(invalid);

        // check required columns presence
        const lowerHeader = (headerFields || []).map(h => (h || '').toLowerCase());
        const missing = requiredColumns.filter(c => !lowerHeader.includes(c));
        if (missing.length) setMessage('Missing required columns: ' + missing.join(', '));

        if (total > MAX_PREVIEW_ROWS) {
          setMessage(prev => prev ? prev + ` Parsing complete. Note: preview truncated to ${MAX_PREVIEW_ROWS} rows for performance.` : `Parsing complete. Note: preview truncated to ${MAX_PREVIEW_ROWS} rows for performance.`);
        }
      },
      error: function(err) {
        setMessage('CSV parse error: ' + err.message);
      }
    });
  };

  const handleUploadAsync = async () => {
    if (!file) return setMessage('Please choose a CSV file first.');
    setLoading(true);
    setMessage('');
    setTaskId(null);
    setTaskStatus(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const fd = new FormData();
      fd.append('file', file);

      const headers = { 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}/api/v1/mailchimp/import-async`, {
        method: 'POST',
        headers,
        body: fd,
      });
      // try to parse body safely
      let body;
      try { body = await res.json(); } catch (e) { body = { message: 'Invalid JSON response' }; }
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      setTaskId(body.task_id);
      setMessage('File queued, task id: ' + body.task_id);
      // clear input
      const input = document.getElementById('mailchimp-csv-input'); if (input) input.value = '';
      setFile(null);
      setPreviewHeader([]); setPreviewRows([]);
    } catch (err) {
      console.error(err);
      // Network errors (CORS/preflight) manifest as TypeError: Failed to fetch
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setMessage('Upload failed: network error or CORS/preflight blocked the request. Check API origin, CORS settings, and that you are authenticated.');
      } else {
        setMessage('Upload failed: ' + (err.message || err));
      }
    } finally { setLoading(false); }
  };

  const handleUploadSync = async () => {
    // fallback: synchronous upload (same as previous behavior)
    if (!file) return setMessage('Please choose a CSV file first.');
    setLoading(true); setMessage('');
    try {
  const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
  const fd = new FormData(); fd.append('file', file);
  const headers = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}/api/v1/mailchimp/import`, { method: 'POST', headers, body: fd });
  let body;
  try { body = await res.json(); } catch (e) { body = { message: 'Invalid JSON response' }; }
  if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
  const importedCount = body.imported ?? 0; const filename = body.filename ?? file.name;
      setMessage(`Imported ${importedCount} contacts into audience ${audienceId}. (file: ${filename})`);
      setFile(null); const input = document.getElementById('mailchimp-csv-input'); if (input) input.value = '';
      fetchLogs();
  } catch (err) { console.error(err); if (err instanceof TypeError && err.message === 'Failed to fetch') setMessage('Import failed: network error or CORS/preflight blocked the request. Check API origin, CORS settings, and that you are authenticated.'); else setMessage('Import failed: ' + (err.message || err)); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: '#fff', borderRadius: 6 }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 600 }}>Mailchimp Contacts</div>
      </div>

      <div style={{ marginTop: 12, padding: 24, background: '#fff', borderRadius: 8, color: '#0b1220' }}>
        <div style={{ marginBottom: 12 }}>Import CSV to Mailchimp audience id: <strong>{audienceId}</strong></div>
        <input id="mailchimp-csv-input" type="file" accept=".csv,text/csv" onChange={handleFileChange} />

        {previewHeader.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Preview</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: '#475569' }}>Rows: {totalRows ?? previewRows.length}</div>
                <select value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setCurrentPage(1); }} style={{ padding: 6 }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    {previewHeader.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e6eef2' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = previewRows || [];
                    const total = rows.length;
                    const lastPage = Math.max(1, Math.ceil(total / pageSize));
                    const page = Math.min(Math.max(1, currentPage), lastPage);
                    const start = (page - 1) * pageSize;
                    const pagedRows = rows.slice(start, start + pageSize);
                    return pagedRows.map((r, ri) => (
                      <tr key={start + ri}>
                        {previewHeader.map((h, ci) => {
                          let val = r[h];
                          if (val === null || val === undefined) val = '';
                          if (typeof val === 'object') val = JSON.stringify(val);
                          return <td key={ci} style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{val}</td>;
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {totalRows !== null && <span style={{ marginRight: 12 }}>Total rows: {totalRows}</span>}
              <span style={{ marginRight: 12 }}>Duplicate emails in preview: {duplicateCount}</span>
              <span>Invalid emails in preview: {invalidEmails}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} style={{ padding: 6 }}>Prev</button>
                <div>Page {currentPage} / {Math.max(1, Math.ceil((previewRows || []).length / pageSize))}</div>
                <button onClick={() => setCurrentPage(p => p + 1)} style={{ padding: 6 }}>Next</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleUploadSync} disabled={loading || !file} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e6eef2', background: '#46aa42', color: '#fff' }}>
            {loading ? 'Uploading...' : 'Upload CSV'}
          </button>
          {loading && (
            <div aria-hidden style={{ marginLeft: 8 }}>
              <svg width="20" height="20" viewBox="0 0 50 50">
                <path fill="#2563eb" d="M43.935,25.145c0-10.318-8.364-18.682-18.682-18.682c-10.318,0-18.682,8.364-18.682,18.682h4.068c0-8.07,6.544-14.614,14.614-14.614c8.07,0,14.614,6.544,14.614,14.614H43.935z">
                  <animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite" />
                </path>
              </svg>
            </div>
          )}
        </div>

        {taskId && (
          <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 6 }}>
            Task: <strong>{taskId}</strong> Status: <strong>{taskStatus || 'queued'}</strong>
          </div>
        )}

        {message && (
          <div style={{ marginTop: 12, padding: 10, background: '#f1f5f9', borderRadius: 6, color: '#0b1220' }}>{message}</div>
        )}
      </div>

      <div style={{ marginTop: 16, padding: 16, background: '#fff', borderRadius: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Import History</div>
        <div style={{ marginTop: 12 }}>
          {logs.length === 0 ? (
            <div style={{ color: '#64748b' }}>No imports yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 6 }}>File</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Audience</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Imported</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ padding: 6 }}>{l.filename}</td>
                    <td style={{ padding: 6 }}>{l.audience_id}</td>
                    <td style={{ padding: 6 }}>{l.imported_count}</td>
                    <td style={{ padding: 6 }}>{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
