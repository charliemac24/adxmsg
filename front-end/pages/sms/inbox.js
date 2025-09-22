import { useEffect, useState, useRef } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import API_BASE_URL from '../../utils/apiConfig';

// Simple confirmation modal used by Contacts page — reused here
function ConfirmModal({ show, onConfirm, onCancel, name, count }) {
  if (!show) return null;
  const title = count && count > 1 ? `Delete ${count} messages?` : 'Delete Message?';
  const body =
    count && count > 1
      ? `Are you sure you want to delete ${count} messages? This action cannot be undone.`
      : `Are you sure you want to delete ${name || 'this message'}? This action cannot be undone.`;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.25)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 28,
          minWidth: 320,
          boxShadow: '0 8px 32px #0002',
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: 38, color: '#e74c3c', marginBottom: 12 }}>🗑️</div>
        <h2 style={{ margin: '0 0 12px 0', fontWeight: 700, fontSize: 20 }}>{title}</h2>
        <div style={{ color: '#555', marginBottom: 18 }}>{body}</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 22px',
              borderRadius: 6,
              border: 'none',
              background: '#eee',
              color: '#222',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 22px',
              borderRadius: 6,
              border: 'none',
              background: '#e74c3c',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Inbox() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState(null); // message for preview
  const [thread, setThread] = useState([]); // conversation thread for preview
  const threadRef = useRef(null);
  const abortControllerRef = useRef(null);
  const openWasReadRef = useRef(false);
  const userToggledReadRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState([]); // for multi-delete
  const [searchQ, setSearchQ] = useState('');
  const [sortBy, setSortBy] = useState('received_at');
  const [sortDir, setSortDir] = useState('desc');
  // preview panel states
  const [panelVisible, setPanelVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // UI helpers / transient state
  const [hoverRow, setHoverRow] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState('');
  const [starred, setStarred] = useState({});
  const [starring, setStarring] = useState({});
  const [replyText, setReplyText] = useState('');
  // Twilio balance for estimating send cost
  const [twilioBalance, setTwilioBalance] = useState(null);
  const [twilioCurrency, setTwilioCurrency] = useState('');
  const [twilioBalanceLoading, setTwilioBalanceLoading] = useState(false);

  const gotoPage = (p) => {
    if (p < 1) p = 1;
    if (p > totalPages) p = totalPages;
    setPage(p);
    fetchMessages(p, pageSize, sortBy, sortDir, searchQ, true);
  };

  // Friendly date/time formatter for UI
  const formatDateTime = (val) => {
    if (!val) return '';
    if (typeof val === 'string' && val.length > 0 && isNaN(Date.parse(val))) {
      return val;
    }
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(val);
    }
  };

  // Pick the best timestamp string for a message
  const pickMessageDate = (m) => {
    if (!m) return null;
    if (m.latest_message && typeof m.latest_message === 'object') m = m.latest_message;
    if (m.message && typeof m.message === 'object') m = m.message;
    if (m.date_executed || m.date_executed_iso) return m.date_executed || m.date_executed_iso;
    if (m.date_sent || m.date_sent_iso || m.date_sent_string)
      return m.date_sent || m.date_sent_iso || m.date_sent_string;
    if (m.received_at || m.received_at_iso) return m.received_at || m.received_at_iso;
    return m.created_at || null;
  };

  const renderReceivedAt = (m) => {
    if (!m) return '';
    if (typeof m === 'string' || typeof m === 'number') return formatDateTime(m);
    const v = pickMessageDate(m) || null;
    return formatDateTime(v);
  };

  const messageEpoch = (m) => {
    const d = pickMessageDate(m);
    if (!d) return 0;
    const t = Date.parse(d);
    return isNaN(t) ? 0 : t;
  };

  const threadCompare = (a, b) => {
    const ta = messageEpoch(a);
    const tb = messageEpoch(b);
    if (ta !== tb) return ta - tb;
    const aLast = !!(a && a.last_message);
    const bLast = !!(b && b.last_message);
    if (aLast !== bLast) return aLast ? 1 : -1;
    const adir = String((a && a.direction) || '').toLowerCase();
    const bdir = String((b && b.direction) || '').toLowerCase();
    const aOut = adir.includes('out') || adir.includes('sent') || adir.includes('send');
    const bOut = bdir.includes('out') || bdir.includes('sent') || bdir.includes('send');
    if (aOut !== bOut) return aOut ? 1 : -1;
    return 0;
  };

  // Build conversations by grouping messages by from_number so inbox shows one row per sender
  const conversations = (() => {
    const map = {};
    const canonical = (x) => (x && x.latest_message && typeof x.latest_message === 'object' ? x.latest_message : x);
    (Array.isArray(messages) ? messages : []).forEach((m) => {
      const dir = String(m.direction || '').toLowerCase();
      const isOutbound = dir.includes('out') || dir.includes('sent') || dir.includes('send');
      const key = isOutbound
        ? m.to_number || m.to || m.contact_number || m.from_number || null
        : m.from_number || m.from || m.contact_number || m.to_number || null;
      if (!key) return;
      // prefer display_name from API item, then group_display_name, otherwise fallback to the phone key
      const itemDisplayName = m.display_name || m.group_display_name || key;
      if (!map[key]) {
        map[key] = {
          id: key,
          from_number: key,
          display_name: itemDisplayName,
          messages: [],
          latest: canonical(m),
          unreadCount: 0,
          is_starred: !!m.is_starred
        };
      }
      map[key].messages.push(m);
      const curDate = messageEpoch(m);
      const prevDate = messageEpoch(map[key].latest);
      if (curDate >= prevDate) {
        map[key].latest = canonical(m);
        // update display_name when latest message changes (keep existing if API didn't provide)
        map[key].display_name = m.display_name || m.group_display_name || map[key].display_name || key;
      }
      if (m.status !== 'read') map[key].unreadCount++;
      if (m.is_starred) map[key].is_starred = true;
    });
    return Object.values(map).sort((a, b) => {
      const da = messageEpoch(a.latest);
      const db = messageEpoch(b.latest);
      if (db !== da) return db - da;
      return threadCompare(a.latest, b.latest);
    });
  })();

  // pagination helpers
  const total = Number(totalCount || (Array.isArray(conversations) ? conversations.length : 0));
  const totalPages = Math.max(1, Math.ceil(total / (pageSize || 1)));
  const start = (page - 1) * pageSize;
  const paged = Array.isArray(conversations) ? conversations : [];

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(
        paged.map((c) => {
          return c.group_number || c.from_number || c.id;
        })
      );
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // minimal fetchMessages implementation
  const fetchMessages = async (
    p = page,
    per = pageSize,
    sb = sortBy,
    sd = sortDir,
    q = searchQ,
    updateUrl = false,
    silent = false
  ) => {
    if (!silent) setLoading(true);
    try {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    } catch (_) {}
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const params = new URLSearchParams();
      params.set('page', p);
      params.set('per_page', per);
      if (sb) params.set('sort_by', sb);
      if (sd) params.set('sort_dir', sd);
      if (q) params.set('q', q);
      const url = `${API_BASE_URL}/api/v1/inbox/groups?${params.toString()}`;
      console.debug('[Inbox] fetchMessages URL:', url);

      const res = await fetch(url, { signal });
      if (res.ok) {
        const body = await res.json();
        console.debug('[Inbox] fetchMessages response body:', body);
        if (body) {
          let items = [];
          if (Array.isArray(body.data)) items = body.data;
          else if (Array.isArray(body.items)) items = body.items;
          else if (Array.isArray(body)) items = body;

          // Filter to only the group's preview item (last_message)
          const lastOnly = items.filter((it) => !!it.last_message);

          const makeSig = (it) => {
            const key = it.group_number || it.from_number || it.to_number || it.id || '';
            const latest =
              it.latest_message && typeof it.latest_message === 'object'
                ? it.latest_message
                : it.latest && typeof it.latest === 'object'
                ? it.latest
                : it;
            const latestId = latest && (latest.id || latest.twilio_sid) ? latest.id || latest.twilio_sid : '';
            const latestTs = pickMessageDate(latest) || '';
            const starred = !!it.is_starred;
            const unread = Number(it.unread_count || 0);
            return `${key}|${latestId}|${latestTs}|s:${starred ? 1 : 0}|u:${unread}`;
          };

          const newSigs = lastOnly.map(makeSig);
          const prevSigs = Array.isArray(messages) ? messages.map(makeSig) : [];

          const changed =
            newSigs.length !== prevSigs.length || newSigs.some((s, i) => prevSigs[i] !== s);
          if (changed) {
            setMessages(lastOnly);
            try {
              const initStar = lastOnly.reduce((acc, it) => {
                const dir = String(it.direction || '').toLowerCase();
                const isOutbound = dir.includes('out') || dir.includes('sent') || dir.includes('send');
                const key = isOutbound
                  ? it.to_number || it.to || it.contact_number || it.from_number || it.id
                  : it.from_number || it.from || it.contact_number || it.to_number || it.id || it.group_number || it.id;
                acc[key] = !!it.is_starred;
                return acc;
              }, {});
              setStarred(initStar);
            } catch (_) {}
          } else {
            console.debug('[Inbox] fetchMessages: no change, skipping state update');
          }

          setTotalCount(Number(body.total_groups || body.total || body.total_count || lastOnly.length));
          if (body.per_page) setPageSize(Number(body.per_page));
        }
      } else {
        console.error('[Inbox] fetchMessages non-OK response', res.status, res.statusText);
        setMessages([]);
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        console.debug('[Inbox] fetchMessages aborted');
      } else {
        console.error('[Inbox] fetchMessages error', e);
        setMessages([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // SMS cost helpers
  const isGsmCompatible = (text) => {
    if (!text) return true;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) return false;
    return true;
  };

  const smsSegmentsForText = (text) => {
    if (!text || text.length === 0) return 0;
    const gsm = isGsmCompatible(text);
    if (gsm) {
      if (text.length <= 160) return 1;
      return Math.ceil(text.length / 153);
    } else {
      if (text.length <= 70) return 1;
      return Math.ceil(text.length / 67);
    }
  };

  const PRICE_PER_SEGMENT = 0.0515; // AUD per segment
  const costEstimate = (segments, recipients) => {
    return Number(segments) * Number(recipients) * PRICE_PER_SEGMENT;
  };

  const formatCurrency = (amt) => {
    const v = Number(amt) || 0;
    return `${twilioCurrency || 'USD'} ${v.toFixed(4).replace(/\.0+$/, '')}`;
  };

  // fetch twilio balance for estimating SMS cost
  useEffect(() => {
    setTwilioBalanceLoading(true);
    fetch(`${API_BASE_URL}/api/v1/twilio/balance`)
      .then((r) => r.json())
      .then((b) => {
        if (b && typeof b.balance !== 'undefined') {
          setTwilioBalance(b.balance);
          setTwilioCurrency(b.currency || '');
        }
      })
      .catch(() => {})
      .finally(() => setTwilioBalanceLoading(false));
  }, []);

  // Confirm delete flow
  const confirmDelete = async () => {
    const id = confirmDeleteId;
    const idsToDelete = id ? [id] : selectedIds;
    setConfirmDeleteId(null);
    setConfirmDeleteName('');
    if (!idsToDelete || idsToDelete.length === 0) return;
    try {
      const phoneDeletes = new Set();
      const msgDeletes = [];

      for (const key of idsToDelete) {
        const conv = paged.find(
          (c) =>
            (c.group_number && String(c.group_number) === String(key)) ||
            (c.from_number && String(c.from_number) === String(key)) ||
            (c.to_number && String(c.to_number) === String(key)) ||
            (c.id && String(c.id) === String(key)) ||
            (c.latest &&
              (String(c.latest.id) === String(key) ||
                String(c.latest.twilio_sid) === String(key)))
        );

        if (conv) {
          const phone = conv.group_number || conv.from_number || conv.to_number || null;
          if (phone) phoneDeletes.add(phone);
          else {
            if (conv.latest && conv.latest.id) msgDeletes.push(conv.latest.id);
          }
        } else {
          if (typeof key === 'string' && key.match(/^[0-9]+$/)) {
            msgDeletes.push(key);
          } else {
            phoneDeletes.add(key);
          }
        }
      }

      let phoneDeletedCount = 0;
      for (const phone of Array.from(phoneDeletes)) {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/v1/inbox/phone/${encodeURIComponent(phone)}/delete`,
            { method: 'POST' }
          );
          if (res.ok) {
            console.log(res);
            phoneDeletedCount++;
          }
        } catch (_) {}
      }

      let msgDeletedCount = 0;
      if (msgDeletes.length > 0) {
        try {
          const r = await fetch(`${API_BASE_URL}/api/v1/inbound/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: msgDeletes })
          });
          if (r.ok) {
            msgDeletedCount = msgDeletes.length;
          }
        } catch (_) {}
      }

      setSelected(null);
      setSelectedIds((prev) => prev.filter((i) => !idsToDelete.includes(i)));
      fetchMessages(page, pageSize, sortBy, sortDir, searchQ, false, true);
      toast.success(
        <div>
          <span style={{ fontSize: 22, marginRight: 8 }}>🗑️</span>
          <span style={{ fontWeight: 600 }}>
            {phoneDeletedCount + msgDeletedCount > 1 ? `${phoneDeletedCount + msgDeletedCount} items deleted.` : 'Item deleted.'}
          </span>
        </div>,
        { position: 'top-right', autoClose: 2000, theme: 'colored' }
      );
    } catch (e) {
      console.error('confirmDelete error', e);
      toast.error('Failed to delete message(s).', {
        position: 'top-right',
        autoClose: 2000,
        theme: 'colored'
      });
    }
  };

  // Fetch conversation thread for a selected message
  const fetchThread = async (messageId, overrideNumber = null) => {
    try {
      let items = [];

      const num =
        overrideNumber ||
        (selected && (selected.from_number || selected.to_number || selected.number || selected.from)) ||
        null;

      if (num) {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/v1/inbound/phone/${encodeURIComponent(num)}/thread`
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.data)) items = data.data;
            else if (Array.isArray(data)) items = data;
            else if (Array.isArray(data.items)) items = data.items;
          }
        } catch (_) {
          items = [];
        }

        if (!items || items.length === 0) {
          const tryUrls = [
            `${API_BASE_URL}/api/v1/inbound/messages?from_number=${encodeURIComponent(num)}&per_page=200`,
            `${API_BASE_URL}/api/v1/inbound/messages?number=${encodeURIComponent(num)}&per_page=200`,
            `${API_BASE_URL}/api/v1/inbound/messages?q=${encodeURIComponent(num)}&per_page=200`
          ];

          for (const url of tryUrls) {
            try {
              const r2 = await fetch(url);
              if (!r2.ok) continue;
              const b2 = await r2.json();
              let found = [];
              if (Array.isArray(b2.data)) found = b2.data;
              else if (Array.isArray(b2)) found = b2;
              else if (Array.isArray(b2.items)) found = b2.items;
              if (found.length > 0) {
                found.sort(threadCompare);
                items = found;
                break;
              }
            } catch (_) {}
          }
        }
      } else {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/inbound/${messageId}/thread`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.data)) items = data.data;
            else if (Array.isArray(data)) items = data;
            else if (Array.isArray(data.items)) items = data.items;
          }
        } catch (_) {
          items = [];
        }
      }

      if (!items || items.length === 0) {
        const num2 =
          overrideNumber ||
          (selected && (selected.from_number || selected.to_number || selected.number || selected.from)) ||
          null;
        if (num2) {
          const tryUrls = [
            `${API_BASE_URL}/api/v1/inbound/messages?from_number=${encodeURIComponent(num2)}&per_page=200`,
            `${API_BASE_URL}/api/v1/inbound/messages?number=${encodeURIComponent(num2)}&per_page=200`,
            `${API_BASE_URL}/api/v1/inbound/messages?q=${encodeURIComponent(num2)}&per_page=200`
          ];

          for (const url of tryUrls) {
            try {
              const r2 = await fetch(url);
              if (!r2.ok) continue;
              const b2 = await r2.json();
              let found = [];
              if (Array.isArray(b2.data)) found = b2.data;
              else if (Array.isArray(b2)) found = b2;
              else if (Array.isArray(b2.items)) found = b2.items;
              if (found.length > 0) {
                found.sort(threadCompare);
                items = found;
                break;
              }
            } catch (_) {}
          }
        }
      }

      if (items && items.length > 0) {
        items.sort(threadCompare);
        setThread(items);
      } else {
        setThread([]);
      }
      return items || [];
    } catch (e) {
      setThread([]);
      return [];
    }
  };

  // Animated close actions
  const performCloseActions = async () => {
    openWasReadRef.current = false;
    userToggledReadRef.current = false;
    setSelected(null);
  };

  const closeWithAnimation = () => {
    setPanelVisible(false);
    setTimeout(() => {
      performCloseActions();
    }, 320);
  };

  // responsive and animation effects
  useEffect(() => {
    const checkMobile = () => setIsMobile(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (selected) {
      requestAnimationFrame(() => setPanelVisible(true));
    } else {
      setPanelVisible(false);
    }
  }, [selected]);

  // auto-scroll thread to bottom when updated
  useEffect(() => {
    if (threadRef.current) {
      try {
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
      } catch (_) {}
    }
  }, [thread]);

  // load messages on mount and when pagination/sort/search change
  useEffect(() => {
    fetchMessages(page, pageSize, sortBy, sortDir, searchQ, false, page > 1 ? true : false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, sortDir, searchQ]);

  return (
    <div style={{ padding: 24 }}>
      {/* force avatar svg size to override global icon rules */}
      <style>{`.inbox-avatar-svg{width:40px !important;height:40px !important;}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 0, fontSize: 24 }} aria-hidden="true">
          ✉️
        </span>
        <h1 style={{ margin: 0, fontSize: 28 }}>Inbox</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Search number or message"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: '1px solid #e6e6e6', minWidth: 260 }}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
                fetchMessages(1, Number(e.target.value));
              }}
              style={{ padding: 8, borderRadius: 6 }}
            >
              <option value={5}>5 / page</option>
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <button
              onClick={() => fetchMessages(1, pageSize)}
              style={{
                background: '#46aa42',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
            <button
              onClick={() => {
                if (selectedIds.length === 0) return;
                setShowConfirmDelete(true);
              }}
              disabled={selectedIds.length === 0}
              style={{
                background: selectedIds.length === 0 ? '#ccc' : '#e74c3c',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 6,
                cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              Delete ({selectedIds.length})
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 3,
          boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          padding: 0,
          overflow: 'hidden'
        }}
      >
        {/* header bar */}
        <div
          style={{
            background: '#46aa42',
            color: '#fff',
            height: 60,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <div style={{ width: 48, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={selectedIds.length > 0 && selectedIds.length === paged.length}
              onChange={(e) => toggleSelectAll(e.target.checked)}
              style={{ transform: 'scale(1.05)' }}
            />
          </div>
          <div style={{ flex: 1, fontWeight: 700 }}>From</div>
          <div style={{ flex: 3, textAlign: 'left', fontWeight: 700 }}>Message</div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              const newDir = sortBy === 'received_at' && sortDir === 'desc' ? 'asc' : 'desc';
              setSortBy('received_at');
              setSortDir(newDir);
              fetchMessages(1, pageSize, 'received_at', newDir, searchQ, true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const newDir = sortBy === 'received_at' && sortDir === 'desc' ? 'asc' : 'desc';
                setSortBy('received_at');
                setSortDir(newDir);
                fetchMessages(1, pageSize, 'received_at', newDir, searchQ, true);
              }
            }}
            style={{ width: 220, textAlign: 'right', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
            title="Sort by Received At"
          >
            Received At {sortBy === 'received_at' ? (sortDir === 'desc' ? '↓' : '↑') : '⇵'}
          </div>
        </div>

        {/* rows list */}
        <div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>
          ) : paged.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>No messages found.</div>
          ) : (
            paged.map((conv) => {
              const latestForReadCheck =
                (conv.latest && conv.latest.latest_message ? conv.latest.latest_message : conv.latest) || {};
              const isReadFlag =
                Number(
                  typeof latestForReadCheck.is_read !== 'undefined'
                    ? latestForReadCheck.is_read
                    : typeof conv.is_read !== 'undefined'
                    ? conv.is_read
                    : 0
                ) === 1;
              // detect if the latest message is outbound so we can render it differently
              const latestDir = (
                (latestForReadCheck && latestForReadCheck.direction) ||
                conv.direction ||
                (conv.latest && conv.latest.direction) ||
                ''
              ).toString().toLowerCase();
              const latestIsOutbound = latestDir.includes('out') || latestDir.includes('sent') || latestDir.includes('send');
              const unreadCountMaybe =
                latestForReadCheck && typeof latestForReadCheck.unread_count !== 'undefined'
                  ? latestForReadCheck.unread_count
                  : conv.unreadCount;

              return (
                <div key={conv.id}>
                  <div
                    onClick={async () => {
                      const m = conv.latest;
                      openWasReadRef.current = isReadFlag;
                      userToggledReadRef.current = false;
                      const selId =
                        conv.latest && (conv.latest.id || conv.latest.twilio_sid)
                          ? conv.latest.id || conv.latest.twilio_sid
                          : conv.id;
                      setSelected({
                        id: selId,
                        from_number: conv.from_number,
                        // prefer display_name (per-group or per-message) returned by the API
                        display_name: conv.display_name || conv.group_display_name || null,
                        status: isReadFlag ? 'read' : 'unread',
                        received_at: pickMessageDate(conv.latest),
                        twilio_sid: conv.latest.twilio_sid,
                        conversation_id: conv.latest.conversation_id,
                        group_number: conv.group_number,
                        group_display_name: conv.group_display_name || null
                      });

                      try {
                        const convKey = conv.group_number || conv.from_number || conv.to_number || null;
                        if (!isReadFlag) {
                          let res = null;
                          if (convKey) {
                            console.debug('[Inbox] calling phone mark-read (inbox) for', convKey);
                            res = await fetch(
                              `${API_BASE_URL}/api/v1/inbox/phone/${encodeURIComponent(convKey)}/mark-read`,
                              { method: 'POST' }
                            );
                          } else if (selId) {
                            console.debug('[Inbox] no phone available; calling per-message mark-read for id', selId);
                            res = await fetch(`${API_BASE_URL}/api/v1/inbox/${selId}/mark-read`, {
                              method: 'POST'
                            });
                          }

                          let applied = 0;
                          if (res && res.ok) {
                            try {
                              const body = await res.json();
                              applied =
                                body && (body.updated || body.updated === 0)
                                  ? Number(body.updated)
                                  : body && body.updated === undefined
                                  ? 1
                                  : 0;
                            } catch (_) {
                              applied = 1;
                            }
                          }

                          if (applied > 0) {
                            setMessages((prev) =>
                              prev.map((m) => {
                                const key = m.group_number || m.from_number || m.to_number || m.id;
                                if (convKey && key && String(key) === String(convKey)) {
                                  const updated = { ...m, is_read: 1, unread_count: 0 };
                                  if (updated.latest_message && typeof updated.latest_message === 'object') {
                                    updated.latest_message = { ...updated.latest_message, is_read: 1, unread_count: 0 };
                                  }
                                  if (updated.latest && typeof updated.latest === 'object') {
                                    updated.latest = { ...updated.latest, is_read: 1, unread_count: 0 };
                                  }
                                  return updated;
                                }
                                if (!convKey && selId && String(m.id) === String(selId)) {
                                  const updated = { ...m, is_read: 1, unread_count: 0 };
                                  if (updated.latest_message && typeof updated.latest_message === 'object') {
                                    updated.latest_message = { ...updated.latest_message, is_read: 1, unread_count: 0 };
                                  }
                                  if (updated.latest && typeof updated.latest === 'object') {
                                    updated.latest = { ...updated.latest, is_read: 1, unread_count: 0 };
                                  }
                                  return updated;
                                }
                                return m;
                              })
                            );
                            setSelected((prev) => (prev ? { ...prev, status: 'read', is_read: 1 } : prev));
                            fetchMessages(page, pageSize, sortBy, sortDir, searchQ, false, true);
                            console.debug('[Inbox] UI updated to read for', convKey || selId);
                          }
                        }
                      } catch (e) {
                        console.error('auto mark-read error', e);
                      }

                      try {
                        const sorted = (Array.isArray(conv.messages) ? conv.messages.slice().sort(threadCompare) : []);
                        setThread(sorted);
                      } catch (e) {
                        setThread([]);
                      }

                      try {
                        const latestId = conv.latest.id || m.id;
                        const convNumber =
                          conv.latest.from_number ||
                          conv.latest.to_number ||
                          conv.from_number ||
                          m.from_number ||
                          m.to_number ||
                          null;
                        await fetchThread(latestId, convNumber);
                      } catch (_) {}
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      borderBottom: '1px solid #f4f4f4',
                      cursor: 'pointer',
                      background: latestIsOutbound ? '#f3f8ff' : isReadFlag ? '#f5f5f5' : '#fff',
                      borderLeft: latestIsOutbound ? '4px solid rgba(59,130,246,0.18)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isReadFlag) {
                        e.currentTarget.style.background = '#fafafa';
                      }
                      setHoverRow(conv.id);
                    }}
                    onMouseLeave={(e) => {
                      if (!isReadFlag) {
                        e.currentTarget.style.background = '#fff';
                      }
                      setHoverRow(null);
                    }}
                  >
                    <div style={{ width: 48, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={(() => {
                          const key = conv.group_number || conv.from_number || conv.to_number || conv.id;
                          return selectedIds.includes(key);
                        })()}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onChange={(e) => {
                          e.stopPropagation();
                          const key = conv.group_number || conv.from_number || conv.to_number || conv.id;
                          toggleSelectId(key);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            const key = conv.group_number || conv.from_number || conv.to_number || conv.id;
                            toggleSelectId(key);
                          }
                        }}
                        style={{ width: 16, height: 16 }}
                      />
                      <button
                        onClick={async (ev) => {
                          ev.stopPropagation();
                          if (starring[conv.id]) return;
                          setStarring((prev) => ({ ...prev, [conv.id]: true }));
                          try {
                            const res = await fetch(`${API_BASE_URL}/api/v1/inbox/${conv.latest.id}/star`, {
                              method: 'POST'
                            });
                            if (res.ok) {
                              const body = await res.json();
                              const serverVal = !!body.is_starred;
                              setStarred((prev) => ({ ...prev, [conv.id]: serverVal }));
                              setMessages((prev) =>
                                prev.map((x) =>
                                  x.from_number === conv.from_number ? { ...x, is_starred: serverVal } : x
                                )
                              );
                            } else {
                              toast.error('Failed to toggle star on the server.', {
                                position: 'top-right',
                                autoClose: 2000
                              });
                            }
                          } catch (e) {
                            console.error('star toggle error', e);
                            toast.error('Network error toggling star.', { position: 'top-right', autoClose: 2000 });
                          } finally {
                            setStarring((prev) => {
                              const copy = { ...prev };
                              delete copy[conv.id];
                              return copy;
                            });
                          }
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: starring[conv.id] ? 'wait' : 'pointer',
                          color: starred[conv.id] ? '#f5b301' : '#999',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        aria-label="star"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill={starred[conv.id] ? '#f5b301' : 'none'}
                          stroke={starred[conv.id] ? '#f5b301' : '#999'}
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M12 .587l3.668 7.431L23.4 9.75l-5.6 5.455L19.335 24 12 19.897 4.665 24l1.536-8.795L.6 9.75l7.732-1.732L12 .587z" />
                        </svg>
                      </button>
                    </div>

                    <div style={{ width: 200, fontWeight: 700, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {conv.display_name || conv.group_display_name || conv.from_number || 'Unknown'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      {(() => {
                        const source =
                          (conv.latest && conv.latest.latest_message ? conv.latest.latest_message : conv.latest) || {};
                        const body = source.message_body || source.body || '';
                        return (
                          <>
                            <div
                              style={{
                                fontWeight: !isReadFlag && !latestIsOutbound ? 700 : 400,
                                color: latestIsOutbound ? '#444' : !isReadFlag ? '#111' : '#666',
                                whiteSpace: 'normal',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                overflowWrap: 'anywhere',
                                wordBreak: 'break-word'
                              }}
                            >
                              {body.split('\n')[0]}
                            </div>
                            <div
                              style={{
                                color: !isReadFlag ? '#666' : '#999',
                                fontSize: 13,
                                marginTop: 4,
                                whiteSpace: 'normal',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                overflowWrap: 'anywhere',
                                wordBreak: 'break-word'
                              }}
                            >
                              {body.slice(0, 240)}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div style={{ width: 220, textAlign: 'right', color: '#666', fontSize: 13 }}>
                      {(() => {
                        const raw =
                          conv.latest && conv.latest.latest_message ? conv.latest.latest_message : conv.latest;
                        if (!raw) return '';
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            {latestIsOutbound ? (
                              <span
                                style={{
                                  background: '#e8f1ff',
                                  color: '#0b63d6',
                                  padding: '4px 8px',
                                  borderRadius: 12,
                                  fontSize: 12,
                                  fontWeight: 700
                                }}
                              >
                                Sent
                              </span>
                            ) : null}
                            <div>{renderReceivedAt(raw)}</div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* nested thread area removed */}
                </div>
              );
            })
          )}
        </div>

        {/* Footer with pagination */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: '#fafafa'
          }}
        >
          <div style={{ color: '#666' }}>
            Showing {Math.min(start + 1, total)} - {Math.min(start + pageSize, total)} of {total}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => gotoPage(page - 1)}
              disabled={page === 1}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e6e6e6', background: '#fff' }}
            >
              Prev
            </button>
            {[...Array(totalPages)].slice(0, 7).map((_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => gotoPage(p)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: p === page ? '1px solid #46aa42' : '1px solid #e6e6e6',
                    background: p === page ? '#e6f6ea' : '#fff'
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => gotoPage(page + 1)}
              disabled={page === totalPages}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e6e6e6', background: '#fff' }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Confirm delete modal */}
      <ConfirmModal
        show={showConfirmDelete || !!confirmDeleteId}
        onConfirm={async () => {
          await confirmDelete();
          setShowConfirmDelete(false);
          setConfirmDeleteId(null);
        }}
        onCancel={() => {
          setShowConfirmDelete(false);
          setConfirmDeleteId(null);
          setConfirmDeleteName('');
        }}
        name={confirmDeleteName}
        count={selectedIds.length}
      />

      {/* sliding preview panel */}
      {selected && (
        <>
          <div
            onClick={() => closeWithAnimation()}
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              bottom: 0,
              right: isMobile ? 0 : 480,
              background: panelVisible ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0)',
              zIndex: 1300,
              transition: 'background 280ms ease',
              pointerEvents: panelVisible ? 'auto' : 'none',
              willChange: 'background'
            }}
          />

          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: isMobile ? '100%' : 520,
              zIndex: 1301,
              display: 'flex',
              flexDirection: 'column',
              background: '#fff',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.12)',
              transform: panelVisible ? 'translateX(0)' : 'translateX(100%)',
              opacity: panelVisible ? 1 : 0,
              transition: 'transform 280ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease',
              willChange: 'transform, opacity',
              fontFamily:
                'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
            }}
          >
            <div
              style={{
                padding: 18,
                borderBottom: '1px solid #f1f1f1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Message Preview</h2>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(() => {
                    if (!selected) return null;
                    const displayName = selected.display_name || selected.group_display_name || null;
                    const normalize = (s) => (s || '').toString().replace(/\D+/g, '');
                    const fromNum = selected.from_number || '';
                    // show parenthesised phone only when we have a non-empty display name
                    // and that name is not just the same phone number (after normalising)
                    const showParenNumber =
                      displayName && fromNum && normalize(displayName) !== normalize(fromNum);

                    if (displayName) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#111', lineHeight: 1 }}>
                            {displayName}
                          </div>
                          {showParenNumber ? (
                            <div style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>({fromNum})</div>
                          ) : null}
                        </div>
                      );
                    }

                    return <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{fromNum || 'Unknown'}</div>;
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Mark-as-read removed: conversations are marked read when the user clicks the row */}
              </div>
              <button
                onClick={() => closeWithAnimation()}
                aria-label="Close preview"
                style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#444' }}
              >
                ✖
              </button>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }}>
              {/* metadata grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, color: '#444', fontSize: 13 }}>
                <div>
                  <div style={{ color: '#888', fontSize: 12 }}>Status</div>
                  <div style={{ fontWeight: 700, marginTop: 4, textTransform: 'capitalize' }}>
                    {typeof selected.is_read !== 'undefined'
                      ? Number(selected.is_read) === 1
                        ? 'Read'
                        : 'Unread'
                      : selected.status}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#888', fontSize: 12 }}>Received At</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>
                    {formatDateTime(pickMessageDate(selected) || selected.date_executed || '')}
                  </div>
                </div>
                {selected && selected.twilio_sid ? (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: '#888', fontSize: 12 }}>Twilio SID</div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        marginTop: 6,
                        wordBreak: 'break-all',
                        background: '#fafafa',
                        padding: 8,
                        borderRadius: 6,
                        border: '1px solid #f0f0f0'
                      }}
                    >
                      {selected.twilio_sid}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Thread area */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '1px solid #f4f6f7', paddingTop: 12 }}>
                <div
                  ref={threadRef}
                  style={{ flex: 1, overflowY: 'auto', paddingRight: 6, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 100 }}
                >
                  {thread.length === 0 ? (
                    <div style={{ color: '#666', padding: 8 }}>No thread messages.</div>
                  ) : (
                    thread.map((t, idx) => {
                      const outbound = t.direction === 'outbound';
                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: outbound ? 'flex-end' : 'flex-start' }}>
                          {!outbound && (
                            <div style={{ width: 56, display: 'flex', alignItems: 'flex-start', paddingTop: 2, paddingRight: 8 }}>
                              <div style={{ width: 40, height: 40, borderRadius: 40, background: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg className="inbox-avatar-svg" width="40" height="40" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                  <circle cx="32" cy="32" r="20" fill="#f2f6fa" />
                                  <circle cx="32" cy="24" r="8" fill="#bfc8d2" />
                                  <path d="M16 50c0-8 8-14 16-14s16 6 16 14v2H16v-2z" fill="#bfc8d2" />
                                </svg>
                              </div>
                            </div>
                          )}

                          <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: outbound ? 'flex-end' : 'flex-start' }}>
                            <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                              {outbound ? 'You' : t.from_number || t.to_number || 'Them'}
                            </div>
                            <div
                              style={{
                                background: outbound ? '#dcfce7' : '#fff',
                                color: '#111',
                                padding: '10px 14px',
                                borderRadius: 14,
                                border: '1px solid rgba(0,0,0,0.04)',
                                boxShadow: outbound ? '0 6px 18px rgba(34,197,94,0.06)' : '0 2px 6px rgba(10,20,30,0.03)'
                              }}
                            >
                              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, fontSize: 14 }}>
                                {t.message_body || t.body || ''}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                              {formatDateTime(pickMessageDate(t) || t.date_executed || '')}
                            </div>
                          </div>

                          {outbound && <div style={{ width: 40 }} />}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* sticky reply footer area */}
                <div style={{ position: 'sticky', bottom: 0, marginTop: 8, borderTop: '1px solid #f1f1f1', paddingTop: 12, paddingBottom: 8, background: '#fff' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      placeholder="Reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      style={{ width: '100%', minHeight: 80, maxHeight: 260, padding: 10, borderRadius: 8, border: '1px solid #e6e6e6', boxSizing: 'border-box', resize: 'vertical' }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ color: '#666', fontSize: 13 }}>
                        {replyText.trim().length === 0 ? (
                          <span>Enter a reply to see cost estimate</span>
                        ) : (
                          (() => {
                            const segments = smsSegmentsForText(replyText);
                            const est = costEstimate(segments, 1);
                            return (
                              <span>
                                {replyText.length} characters • {segments} segment{segments !== 1 ? 's' : ''}
                                {twilioBalanceLoading
                                  ? ' • checking balance...'
                                  : twilioBalance !== null
                                  ? ` • ${formatCurrency(twilioBalance)} available`
                                  : ''}{' '}
                                • Est: {formatCurrency(est)}
                              </span>
                            );
                          })()
                        )}
                      </div>

                      <div>
                        <button
                          onClick={async () => {
                            if (replyText.trim() === '') return;
                            const segments = smsSegmentsForText(replyText);
                            const est = costEstimate(segments, 1);
                            if (twilioBalance !== null && est > twilioBalance) return;

                            // SAFE target id: prefer selected.id; fallback to last thread item id/SID
                            const targetId =
                              (selected && selected.id) ||
                              (thread &&
                                thread.length > 0 &&
                                (thread[thread.length - 1].id || thread[thread.length - 1].twilio_sid)) ||
                              null;
                            if (!targetId) {
                              console.error('No targetId available for reply');
                              return;
                            }

                            // Prepare payload
                            const payload = { message: replyText };
                            const phoneForPayload =
                              (selected && (selected.from_number || selected.to_number)) ||
                              (thread && thread.length > 0 && (thread[0].from_number || thread[0].to_number)) ||
                              null;
                            if (phoneForPayload) payload.phone = phoneForPayload;

                            if (thread && thread.length > 0 && thread[0].conversation_id) {
                              payload.conversation_id = thread[0].conversation_id;
                            } else if (selected && selected.conversation_id) {
                              payload.conversation_id = selected.conversation_id;
                            }

                            // Optimistic append
                            const optimisticId = `tmp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                            const optimisticOut = {
                              id: optimisticId,
                              direction: 'outbound',
                              message_body: replyText,
                              created_at: new Date().toISOString(),
                              twilio_sid: null,
                              conversation_id:
                                payload.conversation_id || (selected && selected.conversation_id) || null,
                              optimistic: true
                            };

                            setThread((prev) => {
                              const merged = [...(prev || []), optimisticOut];
                              merged.sort(threadCompare);
                              return merged;
                            });

                            try {
                              const res = await fetch(`${API_BASE_URL}/api/v1/inbound/${targetId}/reply`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                              });
                              if (res.ok) {
                                const r = await res.json();

                                const serverItems = (await fetchThread(targetId, phoneForPayload || null)) || [];
                                let newThread = serverItems.slice();

                                const sentIncluded = newThread.some(
                                  (i) =>
                                    (i.twilio_sid && r.twilio_sid && i.twilio_sid === r.twilio_sid) ||
                                    (i.message_body === optimisticOut.message_body &&
                                      Math.abs(
                                        new Date(
                                          i.created_at || i.received_at || i.received_at_iso || 0
                                        ).getTime() - new Date(optimisticOut.created_at).getTime()
                                      ) < 2000)
                                );

                                if (!sentIncluded) {
                                  newThread.push({
                                    direction: 'outbound',
                                    message_body: optimisticOut.message_body,
                                    created_at: optimisticOut.created_at,
                                    twilio_sid: r.twilio_sid || null,
                                    conversation_id: optimisticOut.conversation_id || null
                                  });
                                }

                                newThread.sort(threadCompare);
                                setThread(newThread);
                                setReplyText('');
                                fetchMessages(page, pageSize, sortBy, sortDir, searchQ, false, true);
                              } else {
                                // Remove optimistic item on failure
                                setThread((prev) =>
                                  (prev || []).filter((i) => !(i.optimistic && i.id === optimisticId))
                                );
                                console.error('Reply failed', res.status);
                              }
                            } catch (e) {
                              // Remove optimistic item on network error  **(fixed syntax)**
                              setThread((prev) =>
                                (prev || []).filter((i) => !(i.optimistic && i.id === optimisticId))
                              );
                              console.error(e);
                            }
                          }}
                          disabled={
                            replyText.trim().length === 0 ||
                            (twilioBalance !== null && costEstimate(smsSegmentsForText(replyText), 1) > twilioBalance)
                          }
                          title={
                            twilioBalance !== null &&
                            costEstimate(smsSegmentsForText(replyText), 1) > twilioBalance
                              ? 'Insufficient Twilio balance'
                              : ''
                          }
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background:
                              twilioBalance !== null &&
                              costEstimate(smsSegmentsForText(replyText), 1) > twilioBalance
                                ? '#999'
                                : '#16a34a',
                            color: '#fff',
                            cursor: replyText.trim().length === 0 ? 'not-allowed' : 'pointer',
                            fontWeight: 700
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22 2L11 13" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M22 2l-7 20 1-7 7-13z" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span style={{ fontSize: 15 }}>Send Reply</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
