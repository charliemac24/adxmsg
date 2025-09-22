import React, { useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../../utils/apiConfig';

const API_SENT_ENDPOINTS = [
  `${API_BASE_URL}/v1/outbound/sent`           // second fallback
];

function fmtDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString();
}

function normalizePhone(v) {
  if (!v) return '';
  return String(v).replace(/\s+/g, '');
}

export default function SentItems() {
  const [items, setItems] = useState([]);        // raw rows from API
  const [total, setTotal] = useState(0);         // total for pagination (if API provides)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // New: search + date filters (by Sent At)
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(''); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState('');     // yyyy-mm-dd

  async function fetchWithFallback(urls, qs) {
    let lastErr = null;
    for (const base of urls) {
      try {
        const url = qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('No endpoint available');
  }

  async function loadSent(p = page, ps = pageSize) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(p), pageSize: String(ps) }).toString();
      const data = await fetchWithFallback(API_SENT_ENDPOINTS, qs);

      // Accept either array or { data, total } shapes
      const rows = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : [];
      const totalCount =
        typeof data.total === 'number'
          ? data.total
          : Array.isArray(data.data)
          ? data.data.length
          : Array.isArray(data)
          ? data.length
          : 0;

      setItems(rows);
      setTotal(totalCount);
    } catch (e) {
      setError(e.message || String(e));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSent(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSent(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  // resolved adds normalized fields used for searching/filtering
  const resolved = useMemo(() => {
    return (items || []).map((r) => {
      const name =
        r.display_name ||
        r.group_display_name ||
        r.recipient_name ||
        r.to_contact_name ||
        r.contact_name ||
        null;
      const to =
        r.to_number ||
        r.to ||
        r.recipient ||
        r.contact_number ||
        r.phone ||
        r.msisdn ||
        '';
      return {
        ...r,
        _to_number: normalizePhone(to),
        _display_name: name && String(name).trim() !== '' ? String(name) : null,
        // determine a canonical sentAt for filtering
        _sent_at: r.date_executed || r.created_at || r.updated_at || r.sent_at || null,
      };
    });
  }, [items]);

  // filtered applies search + date range (on _sent_at)
  const filtered = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    let fromTs = null;
    let toTs = null;

    if (dateFrom) {
      const d = new Date(`${dateFrom}T00:00:00`);
      if (!Number.isNaN(d.getTime())) fromTs = d.getTime();
    }
    if (dateTo) {
      // include the entire day for dateTo
      const d = new Date(`${dateTo}T23:59:59.999`);
      if (!Number.isNaN(d.getTime())) toTs = d.getTime();
    }

    return resolved.filter((r) => {
      // search by message, recipient name, or to_number
      if (term) {
        const hay = (
          (r._display_name || '') +
          ' ' +
          (r._to_number || '') +
          ' ' +
          (r.message_body || r.body || '')
        ).toLowerCase();
        if (!hay.includes(term)) return false;
      }

      if (fromTs || toTs) {
        const sent = r._sent_at ? new Date(r._sent_at).getTime() : null;
        if (!sent) return false;
        if (fromTs && sent < fromTs) return false;
        if (toTs && sent > toTs) return false;
      }

      return true;
    });
  }, [resolved, searchTerm, dateFrom, dateTo]);

  // paging is applied to filtered results
  const paged = useMemo(() => {
    if (!filtered) return [];
    if (filtered.length <= pageSize) return filtered.slice(0, pageSize);
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Sent Items</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: '#555' }}>
            Page size:{' '}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <div style={{ fontSize: 13, color: '#555' }}>
            Page {page}
          </div>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={filtered.length < pageSize && total <= page * pageSize}
          >
            Next
          </button>
        </div>
      </div>

      {/* Search + Date Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search recipient, number or message..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', minWidth: 320 }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#555' }}>From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#555' }}>To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd' }}
          />
        </div>

        <button
          onClick={() => { setSearchTerm(''); setDateFrom(''); setDateTo(''); setPage(1); }}
          style={{ marginLeft: 'auto', background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '8px 10px', borderRadius: 6 }}
        >
          Clear
        </button>
      </div>

      {error ? (
        <div style={{ color: '#b91c1c', background: '#fee2e2', border: '1px solid #fecaca', padding: 12, borderRadius: 8 }}>
          Failed to load sent items: {error}
        </div>
      ) : null}

      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead style={{ background: '#fafafa' }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px', width: '24%' }}>Recipient</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', width: '44%' }}>Message</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', width: '12%' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', width: '20%' }}>Sent At</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: 16, color: '#666' }}>
                  Loading…
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 16, color: '#666' }}>
                  No sent messages.
                </td>
              </tr>
            ) : (
              paged.map((r, i) => {
                const msg = r.message_body || r.body || '';
                const status = (r.status || r.message_status || '').toString();
                const sentAt = r._sent_at;
                const recipient = r._display_name || r._to_number || 'Unknown';
                return (
                  <tr key={r.id || r.twilio_sid || i} style={{ borderTop: '1px solid #f4f4f4' }}>
                    <td style={{ padding: '12px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <div style={{ fontWeight: 700, color: '#111' }}>{recipient}</div>
                      {r._display_name ? (
                        <div style={{ fontSize: 12, color: '#666' }}>{r._to_number}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: '12px 12px', color: '#222' }}>
                      <div style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                        {msg}
                      </div>
                      {Array.isArray(r.media_urls) && r.media_urls.length > 0 ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {r.media_urls.map((m, mi) => (
                            <img
                              key={mi}
                              src={m}
                              alt="media"
                              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }}
                              onClick={() => window.open(m, '_blank')}
                            />
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          color:
                            status.includes('sent') || status.includes('delivered') ? '#065f46' :
                            status.includes('failed') ? '#991b1b' : '#1f2937',
                          background:
                            status.includes('sent') || status.includes('delivered') ? '#d1fae5' :
                            status.includes('failed') ? '#fee2e2' : '#e5e7eb'
                        }}
                      >
                        {status || 'sent'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 12px', color: '#444' }}>{fmtDate(sentAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div style={{ fontSize: 13, color: '#666' }}>
          Showing {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          {total ? ` • Total ${total}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Prev
          </button>
          <span style={{ fontSize: 13, color: '#555' }}>Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={filtered.length < pageSize && total <= page * pageSize}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}