import { useEffect, useState, useRef } from 'react';
import API from '../utils/apiConfig';

export default function Mailchimp() {
  const [contacts, setContacts] = useState([]);
  const [meta, setMeta] = useState({ total: 0, per_page: 25, current_page: 1, last_page: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState('all');

  const mountedRef = useRef(false);
  const requestCounterRef = useRef(0); // used to ignore stale responses

  const fetchContacts = async (page = 1, q = '', field = 'all') => {
    setLoading(true);
    setError(null);
    try {
      const reqId = ++requestCounterRef.current;
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const qs = `?page=${page}&per_page=25${q ? `&q=${encodeURIComponent(q)}` : ''}${field && field !== 'all' ? `&field=${encodeURIComponent(field)}` : ''}`;
      const res = await fetch(`${API}/api/v1/mailchimp/contacts/4796e76b91${qs}`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || JSON.stringify(body));
      let serverContacts = body.data || [];

      // if a newer request has started, ignore this response
      if (reqId !== requestCounterRef.current) return;

      // client-side fallback filtering if server doesn't support q/field
      if (q && serverContacts.length > 0) {
        const sq = q.toLowerCase();
        serverContacts = serverContacts.filter((c) => {
          if (field === 'email') return (c.email || '').toLowerCase().includes(sq);
          if (field === 'name')
            return (
              ((c.first_name || '') + ' ' + (c.last_name || '')).toLowerCase().includes(sq) ||
              (c.first_name || '').toLowerCase().includes(sq) ||
              (c.last_name || '').toLowerCase().includes(sq)
            );
          if (field === 'business') return (c.business_name || '').toLowerCase().includes(sq);
          return (
            (c.email || '').toLowerCase().includes(sq) ||
            ((c.first_name || '') + ' ' + (c.last_name || '')).toLowerCase().includes(sq) ||
            (c.business_name || '').toLowerCase().includes(sq)
          );
        });
      }

      setContacts(serverContacts);
      setMeta(body.meta || { total: 0, per_page: 25, current_page: 1, last_page: 1 });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fetchContacts(1, searchQuery, searchField);
      return;
    }

    const t = setTimeout(() => {
      fetchContacts(1, searchQuery.trim(), searchField);
    }, 300);

    return () => clearTimeout(t);
  }, [searchQuery, searchField]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: '#fff', borderRadius: 6 }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 600 }}>Mailchimp Contacts</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e6eef2', background: '#fff' }}
            >
              <option value="all">All</option>
              <option value="email">Email</option>
              <option value="name">Name</option>
              <option value="business">Business Name</option>
            </select>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email, name, business"
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e6eef2', minWidth: 220 }}
            />
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchField('all');
                fetchContacts(1, '', 'all');
              }}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e6eef2', background: '#fff' }}
            >
              Clear
            </button>
          </div>
          <div style={{ color: '#64748b', fontSize: 14 }}>Total: {meta.total}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', boxShadow: '0 6px 18px rgba(2,6,23,0.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', minWidth: 1100 }}>
            <thead>
              <tr style={{ background: '#46aa42', color: '#fff', height: 60 }}>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>First Name</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Last Name</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Business Name</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Business Address</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Phone</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>State</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Synced At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: 'center' }}>
                    Loading…
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    {error ? `Error: ${error}` : 'No contacts found'}
                  </td>
                </tr>
              ) : (
                contacts.map((c, idx) => (
                  <tr
                    key={c.id || idx}
                    style={{ borderBottom: '1px solid #eef2f6', background: idx % 2 === 0 ? '#ffffff' : '#fbfbfb', transition: 'background 120ms ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fbfbfb')}
                  >
                    <td style={{ padding: '12px 16px', width: 70, color: '#475569' }}>{(meta.current_page - 1) * meta.per_page + idx + 1}</td>
                    <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 600 }}>{c.email}</td>
                    <td style={{ padding: '12px 16px', color: '#334155' }}>{c.first_name}</td>
                    <td style={{ padding: '12px 16px', color: '#334155' }}>{c.last_name}</td>
                    <td style={{ padding: '12px 16px', color: '#0b1220' }}>{c.business_name}</td>
                    <td style={{ padding: '12px 16px', color: '#0b1220' }}>{c.business_address}</td>
                    <td style={{ padding: '12px 16px', color: '#0b1220', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace' }}>{c.phone}</td>
                    <td style={{ padding: '12px 16px', color: '#334155' }}>{c.state}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{c.synced_at ? new Date(c.synced_at).toLocaleString() : ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => fetchContacts(Math.max(1, meta.current_page - 1), searchQuery, searchField)}
          disabled={meta.current_page <= 1 || loading}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e6eef2', background: '#fff' }}
        >
          Prev
        </button>
        <div style={{ color: '#64748b' }}>Page {meta.current_page} / {meta.last_page}</div>
        <button
          onClick={() => fetchContacts(Math.min(meta.last_page, meta.current_page + 1), searchQuery, searchField)}
          disabled={meta.current_page >= meta.last_page || loading}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e6eef2', background: '#fff' }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
