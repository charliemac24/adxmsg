import { useEffect, useState, useMemo } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import API_BASE_URL from '../../utils/apiConfig';
import Select from "react-select";

// Fancy confirmation modal component
function ConfirmModal({ show, onConfirm, onCancel, name }) {
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.25)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: 32, minWidth: 340,
        boxShadow: "0 8px 32px #0002", textAlign: "center"
      }}>
        <div style={{ fontSize: 38, color: "#e74c3c", marginBottom: 12 }}>🗑️</div>
        <h2 style={{ margin: "0 0 12px 0", fontWeight: 700, fontSize: 22 }}>Delete Contact?</h2>
        <div style={{ color: "#555", marginBottom: 24 }}>
          Are you sure you want to delete <b>{name}</b>?<br />
          This action cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 28px", borderRadius: 6, border: "none",
              background: "#eee", color: "#222", fontWeight: 600, fontSize: 16, cursor: "pointer"
            }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 28px", borderRadius: 6, border: "none",
              background: "#e74c3c", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer"
            }}
          >Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function Contacts() {
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showBulkUnsubscribeModal, setShowBulkUnsubscribeModal] = useState(false);
  const [showBulkResubscribeModal, setShowBulkResubscribeModal] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10; // contacts per page
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [groups, setGroups] = useState([]);
  const [addressStates, setAddressStates] = useState([]);
  const [addForm, setAddForm] = useState({
    first_name: "",
    last_name: "",
    address_state: "",
    primary_no: "",
    email_add: "",
    group_no: "",
    is_subscribed: "1",
  });
  // Filter dropdown state
  const [filterGroup, setFilterGroup] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterUnsubscribed, setFilterUnsubscribed] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [twilioBalance, setTwilioBalance] = useState(null);
  const [twilioCurrency, setTwilioCurrency] = useState('');
  const [twilioBalanceLoading, setTwilioBalanceLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [selected, setSelected] = useState([]);
  const [bulkAction, setBulkAction] = useState(""); // "group" or "state"
  const [bulkValue, setBulkValue] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Composer (slide-in) state for Send SMS
  const [composerContact, setComposerContact] = useState(null);
  const [composerBody, setComposerBody] = useState('');
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerIsMobile, setComposerIsMobile] = useState(false);
  // Bulk composer state (send to selected contacts)
  const [bulkComposerVisible, setBulkComposerVisible] = useState(false);
  const [bulkComposerBody, setBulkComposerBody] = useState('');
  const [bulkComposerIsMobile, setBulkComposerIsMobile] = useState(false);
  // Export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportGroups, setExportGroups] = useState([]); // array of group ids
  const [exportStates, setExportStates] = useState([]); // array of state ids
  const [exportStatus, setExportStatus] = useState('all');
  const [exportPreviewCount, setExportPreviewCount] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Search box state (search by name or phone)
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/contacts`)
      .then(res => {
        if (!res.ok) throw new Error(`Contacts fetch failed: ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error('Contacts endpoint did not return JSON');
        return res.json();
      })
      .then(data => {
        setContacts(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed loading contacts:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/groups`)
      .then(res => {
        if (!res.ok) throw new Error(`Groups fetch failed: ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error('Groups endpoint did not return JSON');
        return res.json();
      })
      .then(data => setGroups(data))
      .catch(err => console.error('Failed loading groups:', err));

    fetch(`${API_BASE_URL}/v1/address-states`)
      .then(res => {
        if (!res.ok) throw new Error(`Address-states fetch failed: ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error('Address-states endpoint did not return JSON');
        return res.json();
      })
      .then(data => setAddressStates(data))
      .catch(err => console.error('Failed loading address-states:', err));
  }, []);

  // fetch twilio balance for estimating SMS cost
  useEffect(() => {
    setTwilioBalanceLoading(true);
    fetch(`${API_BASE_URL}/api/v1/twilio/balance`)
      .then(r => r.json())
      .then(b => {
        if (b && typeof b.balance !== 'undefined') {
          setTwilioBalance(b.balance);
          setTwilioCurrency(b.currency || '');
        }
      })
      .catch(() => {})
      .finally(() => setTwilioBalanceLoading(false));
  }, []);

  // helpers: SMS segments calculation (basic GSM vs UCS-2 detection)
  const isGsmCompatible = (text) => {
    // simple approximation: if any char has charCode > 127, treat as UCS-2
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) return false;
    return true;
  };

  const smsSegmentsForText = (text) => {
    if (!text || text.length === 0) return 0;
    const gsm = isGsmCompatible(text);
    if (gsm) {
      if (text.length <= 160) return 1;
      // concatenated messages: 153 chars per segment
      return Math.ceil(text.length / 153);
    } else {
      if (text.length <= 70) return 1;
      return Math.ceil(text.length / 67);
    }
  };

  const PRICE_PER_SEGMENT = 0.0515; // AUD per segment (first 20k/month rate)
  const costEstimate = (segments, recipients) => {
    // return monetary cost (AUD) for given segments and recipient count
    return Number(segments) * Number(recipients) * PRICE_PER_SEGMENT;
  };

  const formatCurrency = (amt) => {
    const v = Number(amt) || 0;
    // show with currency and two decimal places
  return `${twilioCurrency || 'USD'} ${v.toFixed(4).replace(/\.0+$/,'')}`;
  };

  // Filtered contacts derived from the search query and dropdowns (client-side)
  const filteredContacts = useMemo(() => {
    let filtered = contacts;
    if (filterGroup) {
      filtered = filtered.filter(c => String(c.group_no) === String(filterGroup));
    }
    if (filterState) {
      filtered = filtered.filter(c => String(c.address_state) === String(filterState));
    }
    if (filterUnsubscribed) {
      filtered = filtered.filter(c => Number(c.is_subscribed) === 0 || c.is_subscribed === 0 || c.is_subscribed === '0');
    }
    if (searchQuery) {
      const q = searchQuery.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, "");
      filtered = filtered.filter(c => {
        const fullName = `${(c.first_name || "").toString()} ${(c.last_name || "").toString()}`.toLowerCase();
        const phone = (c.primary_no || "").toString().toLowerCase();
        const phoneDigits = phone.replace(/\D/g, "");
        return (
          fullName.includes(q) ||
          phone.includes(q) ||
          (qDigits && phoneDigits.includes(qDigits))
        );
      });
    }
    return filtered;
  }, [contacts, searchQuery, filterGroup, filterState, filterUnsubscribed]);

  // Reset to first page when filters/search change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterGroup, filterState, filterUnsubscribed]);

  // Pagination logic
  const totalPages = Math.ceil(filteredContacts.length / pageSize) || 1;
  const paginatedContacts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredContacts.slice(start, start + pageSize);
  }, [filteredContacts, currentPage]);

  const handleEdit = (contact) => {
    setEditId(contact.id);
    setEditData({
      ...contact,
      group_no: contact.group_no ? contact.group_no.toString() : "",
      address_state: contact.address_state ? contact.address_state.toString() : "",
      is_subscribed: contact.is_subscribed ? 1 : 0,
    });
  };

  const handleCancel = () => {
    setEditId(null);
    setEditData({});
  };

  const handleChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    const dataToSend = { ...editData };
    if (!dataToSend.group_no) delete dataToSend.group_no;
    if (!dataToSend.address_state) delete dataToSend.address_state;

    const res = await fetch(`${API_BASE_URL}/api/v1/contacts/${editId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataToSend),
    });
    if (res.ok) {
      setContacts(contacts.map(c => (c.id === editId ? { ...editData } : c)));
      setEditId(null);
      setEditData({});
      toast.success('Contact updated successfully!', {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
    } else {
      toast.error('Failed to update contact.', {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
    }
  };

  const handleDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setConfirmDeleteName("");
    if (!id) return;
    const res = await fetch(`${API_BASE_URL}/api/v1/contacts/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setContacts(contacts.filter(c => c.id !== id));
      toast.success(
        <div>
          <span style={{ fontSize: 22, marginRight: 8 }}>🗑️</span>
          <span style={{ fontWeight: 600 }}>Contact deleted successfully!</span>
        </div>,
        {
          position: "top-right",
          autoClose: 2000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "colored",
        }
      );
    } else {
      toast.error('Failed to delete contact.', {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
    }
  };

  // Delete all contacts handler
  const handleDeleteAll = async () => {
    setShowDeleteAllModal(false);
    if (!contacts || contacts.length === 0) {
      toast.info('No contacts to delete.', { position: 'top-right' });
      return;
    }
    const ids = contacts.map(c => c.id);
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/contacts/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        setContacts([]);
        setSelected([]);
        toast.success(
          <div>
            <span style={{ fontSize: 22, marginRight: 8 }}>🗑️</span>
            <span style={{ fontWeight: 600 }}>All contacts deleted.</span>
          </div>,
          { position: 'top-right', autoClose: 2500, theme: 'colored' }
        );
      } else {
        toast.error('Failed to delete all contacts.', { position: 'top-right' });
      }
    } catch (e) {
      toast.error('Failed to delete all contacts.', { position: 'top-right' });
    } finally {
      setProcessing(false);
    }
  };

  // Bulk unsubscribe handler
  const handleBulkUnsubscribe = async () => {
    setShowBulkUnsubscribeModal(false);
    if (!selected || selected.length === 0) {
      toast.info('No contacts selected to unsubscribe.', { position: 'top-right' });
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/contacts/bulk-unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected.map(Number) })
      });
      if (res.ok) {
        // update UI: mark selected contacts as unsubscribed
        setContacts(prev => prev.map(c => selected.includes(c.id) ? { ...c, is_subscribed: 0 } : c));
        setSelected([]);
        toast.success(
          <div>
            <span style={{ fontSize: 22, marginRight: 8 }}>🔕</span>
            <span style={{ fontWeight: 600 }}>Selected contacts unsubscribed.</span>
          </div>,
          { position: 'top-right', autoClose: 2000, theme: 'colored' }
        );
      } else {
        toast.error('Bulk unsubscribe failed.', { position: 'top-right' });
      }
    } catch (e) {
      toast.error('Bulk unsubscribe failed.', { position: 'top-right' });
    } finally {
      setProcessing(false);
    }
  };

  // Bulk resubscribe handler
  const handleBulkResubscribe = async () => {
    setShowBulkResubscribeModal(false);
    if (!selected || selected.length === 0) {
      toast.info('No contacts selected to resubscribe.', { position: 'top-right' });
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/contacts/bulk-resubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected.map(Number) })
      });
      if (res.ok) {
        // update UI: mark selected contacts as subscribed
        setContacts(prev => prev.map(c => selected.includes(c.id) ? { ...c, is_subscribed: 1 } : c));
        setSelected([]);
        toast.success(
          <div>
            <span style={{ fontSize: 22, marginRight: 8 }}>🔔</span>
            <span style={{ fontWeight: 600 }}>Selected contacts resubscribed.</span>
          </div>,
          { position: 'top-right', autoClose: 2000, theme: 'colored' }
        );
      } else {
        toast.error('Bulk resubscribe failed.', { position: 'top-right' });
      }
    } catch (e) {
      toast.error('Bulk resubscribe failed.', { position: 'top-right' });
    } finally {
      setProcessing(false);
    }
  };

  // Open slide-in composer for a contact
  const handleSendSms = (contact) => {
    if (!contact || !contact.primary_no) {
      toast.error('No phone number available for this contact.', { position: 'top-right' });
      return;
    }
    setComposerContact(contact);
    setComposerBody('');
    // detect mobile width
    setComposerIsMobile(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
    // show with animation on next frame
    requestAnimationFrame(() => setComposerVisible(true));
  };

  // Close composer with animation
  const closeComposerWithAnimation = () => {
    setComposerVisible(false);
    // allow panel transition to complete
    setTimeout(() => {
      setComposerContact(null);
      setComposerBody('');
    }, 320);
  };

  // Send from composer
  const sendComposerMessage = async () => {
    if (!composerContact || !composerContact.primary_no) return;
    if (!composerBody || composerBody.trim() === '') return;
  const to = composerContact.primary_no;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      // The backend will append the unsubscribe link when logging/sending, so we only send the base body.
      const res = await fetch(`${API_BASE_URL}/api/v1/outbound/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ contact_id: composerContact.id, message_body: composerBody }),
      });
      if (res.ok) {
        toast.success('Message sent!', { position: 'top-right', autoClose: 2000, theme: 'colored' });
        // close panel
        closeComposerWithAnimation();
      } else {
        const txt = await res.text().catch(() => '');
        toast.error(`Failed to send message. ${txt}`, { position: 'top-right' });
      }
    } catch (e) {
      toast.error('Failed to send message (network error).', { position: 'top-right' });
    }
  };

  // compute segments including unsubscribe link for single composerContact
  const composerTotalSegments = () => {
    if (!composerContact) return 0;
    const link = composerContact.unsubscribe_link || '';
    const body = composerBody + (link ? "\nOpt out link : " + link : '');
    return smsSegmentsForText(body);
  };

  // compute total estimated cost segments for selected contacts with unsubscribe links appended
  const bulkSelectedTotalSegments = () => {
    if (!selected || selected.length === 0) return 0;
    let totalSegments = 0;
    const selectedContacts = contacts.filter(c => selected.includes(c.id));
    selectedContacts.forEach(c => {
      const link = c.unsubscribe_link || '';
      const body = bulkComposerBody + (link ? "\nOpt out link : " + link : '');
      totalSegments += smsSegmentsForText(body);
    });
    return totalSegments;
  };

  // Send bulk messages to selected contacts
  const sendBulkToSelected = async () => {
    if (!selected || selected.length === 0) return;
    if (!bulkComposerBody || bulkComposerBody.trim() === '') return;
    const recipients = contacts.filter(c => selected.includes(c.id) && c.primary_no).map(c => ({ id: c.id, to: c.primary_no }));
    if (recipients.length === 0) {
      toast.error('No valid phone numbers for selected contacts.', { position: 'top-right' });
      return;
    }

    setProcessing(true);
    try {
      // send messages in parallel, but limit concurrency if needed (simple parallel for now)
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // send a single request with an array of contact ids so the backend handles per-contact processing
      const contactIds = recipients.map(r => r.id);
      const res = await fetch(`${API_BASE_URL}/api/v1/outbound/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ contact_id: contactIds, message_body: bulkComposerBody }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        const okCount = Array.isArray(body.results) ? body.results.filter(x => x.status !== 'failed').length : 0;
        const failCount = Array.isArray(body.results) ? body.results.filter(x => x.status === 'failed').length : 0;
        if (okCount > 0) toast.success(`${okCount} message${okCount !== 1 ? 's' : ''} sent to selected contacts.`, { position: 'top-right' });
        if (failCount > 0) toast.error(`${failCount} message${failCount !== 1 ? 's' : ''} failed.`, { position: 'top-right' });
      } else {
        toast.error('Failed to send messages.', { position: 'top-right' });
      }

      // close panel and clear body
      setBulkComposerVisible(false);
      setBulkComposerBody('');
      setSelected([]);
    } catch (e) {
      toast.error('Failed to send messages.', { position: 'top-right' });
    } finally {
      setProcessing(false);
    }
  };

  const handleAddChange = e => {
    const { name, value } = e.target;
    setAddForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddSubmit = async e => {
    e.preventDefault();
    setAddLoading(true);
    const res = await fetch(`${API_BASE_URL}/api/v1/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    setAddLoading(false);
    if (res.ok) {
      const newContact = await res.json(); // get the newly created contact from response
      setAddForm({
        first_name: "",
        last_name: "",
        address_state: "",
        primary_no: "",
        email_add: "",
        group_no: "",
        is_subscribed: "1",
      });
      setShowAddModal(false);
      toast.success("Contact added successfully!", {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
      setContacts(prev => [...prev, newContact]); // add the new contact to the table
    } else {
      toast.error("Failed to add contact.", {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelected(filteredContacts.map(c => c.id));
    } else {
      setSelected([]);
    }
  };

  const handleSelect = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Prepare options for react-select
  const groupOptions = groups.map(g => ({
    value: g.id,
    label: g.group_name
  }));
  const stateOptions = addressStates.map(s => ({
    value: s.id,
    label: s.state
  }));

  // count contacts per group (used to optionally disable Delete when a group has members)
  const contactCountByGroup = useMemo(() => {
    const map = {};
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const key = String(c.group_no ?? "");
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [contacts]);

  // Bulk assign handler
  const handleBulkAssign = async () => {
    if (!bulkAction || !bulkValue || selected.length === 0) return;
    setBulkLoading(true);
    setProcessing(true);

    let payload = { ids: selected.map(Number) };
    let url = "";
    if (bulkAction === "group") {
      payload.group_no = bulkValue.value;
      url = `${API_BASE_URL}/api/v1/contacts/bulk-assign-group`;
    } else if (bulkAction === "state") {
      payload.address_state = bulkValue.value;
      url = `${API_BASE_URL}/api/v1/contacts/bulk-assign-state`;
    }

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setBulkLoading(false);
      setProcessing(false);

      if (res.ok) {
        // Update contacts in UI
        setContacts(contacts.map(c =>
          selected.includes(c.id)
            ? {
                ...c,
                ...(bulkAction === "group" ? { group_no: bulkValue.value } : {}),
                ...(bulkAction === "state" ? { address_state: bulkValue.value } : {}),
              }
            : c
        ));
        setSelected([]);
        setBulkAction("");
        setBulkValue(null);
        toast.success(
          <div>
            <span style={{ fontSize: 22, marginRight: 8 }}>✅</span>
            <span style={{ fontWeight: 600 }}>
              Assigned to {bulkAction === "group" ? "Group" : "Address State"} successfully!
            </span>
          </div>,
          { position: "top-right", autoClose: 2000, theme: "colored" }
        );
      } else {
        toast.error("Bulk assignment failed.", {
          position: "top-right",
          autoClose: 2000,
          theme: "colored",
        });
      }
    } catch (e) {
      setBulkLoading(false);
      setProcessing(false);
      toast.error("Bulk assignment failed.", {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
    }
  };

  return (
    <div className={editId ? 'contacts-page contacts-page--editing' : 'contacts-page'}>
      <style>{`
        /* When editing, only reduce padding for action buttons inside the contacts table row
           (Send/Edit/Delete) and the inline Save/Cancel controls so other page buttons
           (Add, Export, bulk actions) keep their normal spacing. */
        .contacts-page--editing .compact-table tbody .action-btn,
        .contacts-page--editing .compact-table tbody .btn-save,
        .contacts-page--editing .compact-table tbody .btn-cancel {
          padding: 8px 7px !important;
        }
      `}</style>
      <style>       
        {`
         .action-btn--send { background: #9fcaf0; color: #0369a1; border: 1px solid #cfe7fb;margin-top:-9px; }
        /* prevent "jump" on hover for the send button */
        .action-btn--send { transition: none; }
        .action-btn--send:not([disabled]):hover { transform: none; box-shadow: none; }
        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 32px;
          line-height: 20px;
          padding: 6px 12px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          vertical-align: middle;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
          transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
        }
        .action-btn svg { flex-shrink: 0; }
  /*.action-btn:not([disabled]):hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(12,17,43,0.06); }*/
  /* spacing between adjacent action buttons */
  .action-btn + .action-btn { margin-left: 8px; }
        .action-btn[disabled] { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
        
        .action-btn--edit { background: #46aa42; color: #fff; border: none; }
        .action-btn--delete { background: #d32f2f; color: #fff; border: none; }
      `}
      
      </style>
      {/* Processing spinner overlay (used for bulk actions) */}
      {processing && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.6)', zIndex: 9998,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 72,
              height: 72,
              border: '8px solid rgba(0,0,0,0.08)',
              borderTop: '8px solid #46aa42',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: 12,
            }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#46aa42' }}>Processing...</div>
          </div>
          <style>{`@keyframes spin {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}`}</style>
        </div>
      )}
      <ConfirmModal
        show={!!confirmDeleteId}
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmDeleteId(null); setConfirmDeleteName(""); }}
        name={confirmDeleteName}
      />

      {/* Bulk Action Section */}
      {selected.length > 0 && (
        <div style={{
          background: "#f4f8f4",
          borderRadius: 8,
          padding: 18,
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: 'wrap'
        }}>
          <span style={{ fontWeight: 600 }}>{selected.length} selected</span>
          <span style={{ color: "#888" }}>|</span>
          <label style={{ fontWeight: 500, marginRight: 8 }}>Bulk assign to:</label>
          <select
            value={bulkAction}
            onChange={e => {
              setBulkAction(e.target.value);
              setBulkValue(null);
            }}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option value="">Select action</option>
            <option value="group">Group</option>
            <option value="state">Address State</option>
          </select>
          {bulkAction === "group" && (
            <div style={{ minWidth: 200 }}>
              <Select
                options={groupOptions}
                value={bulkValue}
                onChange={setBulkValue}
                placeholder="Select group..."
                isClearable
                styles={{ control: provided => ({ ...provided, minHeight: 38 }) }}
              />
            </div>
          )}
          {bulkAction === "state" && (
            <div style={{ minWidth: 200 }}>
              <Select
                options={stateOptions}
                value={bulkValue}
                onChange={setBulkValue}
                placeholder="Select address state..."
                isClearable
                styles={{ control: provided => ({ ...provided, minHeight: 38 }) }}
              />
            </div>
          )}
          {/* Uniform light buttons with icons for bulk actions */}
          <style>{`
            .bulk-action-btn {
              transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
              will-change: transform, box-shadow;
            }
            .bulk-action-btn:hover:not([disabled]), .bulk-action-btn:focus:not([disabled]) {
              transform: translateY(-3px);
              box-shadow: 0 8px 20px rgba(12,17,43,0.06);
              border-color: #cfe7fb;
              outline: none;
            }
            .bulk-action-btn:active:not([disabled]) {
              transform: translateY(-1px);
            }
            .bulk-action-btn[disabled] {
              opacity: 0.6;
              cursor: not-allowed;
              transform: none;
              box-shadow: none;
            }
          `}</style>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="bulk-action-btn"
              disabled={!bulkAction || !bulkValue || bulkLoading}
              onClick={handleBulkAssign}
              title="Assign group or state"
              style={{
                background: '#fbfdfe',
                color: '#1f2937',
                border: '1px solid #e6eef6',
                borderRadius: 6,
                padding: '8px 16px',
                fontWeight: 600,
                fontSize: 14,
                cursor: (!bulkAction || !bulkValue || bulkLoading) ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16, opacity: 0.9 }}>🗂️</span>
              <span>{bulkLoading ? 'Assigning...' : 'Assign'}</span>
            </button>

            <button
              className="bulk-action-btn"
              onClick={() => setShowBulkDeleteModal(true)}
              title="Delete selected contacts"
              style={{
                background: '#fbfdfe',
                color: '#1f2937',
                border: '1px solid #e6eef6',
                borderRadius: 6,
                padding: '8px 16px',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16, opacity: 0.9 }}>🗑️</span>
              <span>Delete Selected</span>
            </button>

            <button
              className="bulk-action-btn"
              onClick={() => setShowBulkUnsubscribeModal(true)}
              title="Unsubscribe selected contacts"
              style={{
                background: '#fbfdfe',
                color: '#1f2937',
                border: '1px solid #e6eef6',
                borderRadius: 6,
                padding: '8px 16px',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16, opacity: 0.9 }}>🔕</span>
              <span>Unsubscribe Selected</span>
            </button>

            <button
              className="action-btn action-btn--send"
              onClick={() => {
                setBulkComposerBody('');
                setBulkComposerIsMobile(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
                requestAnimationFrame(() => setBulkComposerVisible(true));
              }}
              title="Send SMS to selected contacts"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13" stroke="#0369a1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="#0369a1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span>Send to Selected</span>
            </button>

            <button
              className="bulk-action-btn"
              onClick={() => setShowBulkResubscribeModal(true)}
              title="Resubscribe selected contacts"
              style={{
                background: '#fbfdfe',
                color: '#1f2937',
                border: '1px solid #e6eef6',
                borderRadius: 6,
                padding: '8px 16px',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16, opacity: 0.9 }}>🔔</span>
              <span>Resubscribe Selected</span>
            </button>
          </div>
        </div>
      )}
      {/* Bulk Delete Modal */}
      {showBulkDeleteModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.25)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 32, minWidth: 340,
            boxShadow: "0 8px 32px #0002", textAlign: "center"
          }}>
            <div style={{ fontSize: 38, color: "#e74c3c", marginBottom: 12 }}>🗑️</div>
            <h2 style={{ margin: "0 0 12px 0", fontWeight: 700, fontSize: 22 }}>Delete Selected Contacts?</h2>
            <div style={{ color: "#555", marginBottom: 24 }}>
              Are you sure you want to delete <b>{selected.length}</b> contact{selected.length > 1 ? 's' : ''}?<br />
              This action cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                style={{
                  padding: "10px 28px", borderRadius: 6, border: "none",
                  background: "#eee", color: "#222", fontWeight: 600, fontSize: 16, cursor: "pointer"
                }}
              >Cancel</button>
              <button
                onClick={async () => {
                  setShowBulkDeleteModal(false);
                  if (selected.length === 0) return;
                  setProcessing(true);
                  try {
                    const res = await fetch(`${API_BASE_URL}/api/v1/contacts/bulk-delete`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ids: selected.map(Number) })
                    });
                    if (res.ok) {
                      setContacts(contacts.filter(c => !selected.includes(c.id)));
                      setSelected([]);
                      toast.success(
                        <div>
                          <span style={{ fontSize: 22, marginRight: 8 }}>🗑️</span>
                          <span style={{ fontWeight: 600 }}>Contacts deleted successfully!</span>
                        </div>,
                        { position: "top-right", autoClose: 2000, theme: "colored" }
                      );
                    } else {
                      toast.error('Bulk delete failed.', {
                        position: "top-right",
                        autoClose: 2000,
                        theme: "colored",
                      });
                    }
                  } catch (e) {
                    toast.error('Bulk delete failed.', {
                      position: "top-right",
                      autoClose: 2000,
                      theme: "colored",
                    });
                  } finally {
                    setProcessing(false);
                  }
                }}
                disabled={processing}
                style={{
                  padding: "10px 28px", borderRadius: 6, border: "none",
                  background: "#e74c3c", color: "#fff", fontWeight: 700, cursor: "pointer",
                  opacity: processing ? 0.8 : 1
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Resubscribe Modal */}
      {showBulkResubscribeModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.25)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 28, minWidth: 340,
            boxShadow: "0 8px 32px #0002", textAlign: "center"
          }}>
            <div style={{ fontSize: 38, color: "#2e7d32", marginBottom: 12 }}>🔔</div>
            <h2 style={{ margin: "0 0 12px 0", fontWeight: 700, fontSize: 22 }}>Resubscribe Selected Contacts?</h2>
            <div style={{ color: "#555", marginBottom: 24 }}>
              This will mark <b>{selected.length}</b> selected contact{selected.length !== 1 ? 's' : ''} as subscribed.<br />
              They will be eligible to receive marketing campaign SMS again.
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              <button
                onClick={() => setShowBulkResubscribeModal(false)}
                style={{
                  padding: "10px 26px", borderRadius: 6, border: "none",
                  background: "#eee", color: "#333", fontWeight: 600, cursor: 'pointer'
                }}
              >Cancel</button>
              <button
                onClick={handleBulkResubscribe}
                style={{
                  padding: "10px 26px", borderRadius: 6, border: "none",
                  background: "#2e7d32", color: "#fff", fontWeight: 700, cursor: 'pointer'
                }}
              >Resubscribe</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Contacts Modal (danger) */}
      {showDeleteAllModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.35)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 28, minWidth: 360,
            boxShadow: "0 10px 40px rgba(0,0,0,0.2)", textAlign: "center"
          }}>
            <div style={{ fontSize: 42, color: "#b71c1c", marginBottom: 12 }}>⚠️</div>
            <h2 style={{ margin: "0 0 12px 0", fontWeight: 800, fontSize: 22, color: '#222' }}>Delete All Contacts?</h2>
            <div style={{ color: "#444", marginBottom: 18 }}>
              This will permanently delete <b>all contacts</b> from the system.<br />
              This action cannot be undone. Please be certain before proceeding.
            </div>
            <div style={{ color: '#666', fontSize: 13, marginBottom: 18 }}>You can export contacts before deleting if you need a backup.</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              <button
                onClick={() => setShowDeleteAllModal(false)}
                style={{
                  padding: "10px 26px", borderRadius: 6, border: "1px solid #ddd",
                  background: "#fff", color: "#333", fontWeight: 700, cursor: 'pointer'
                }}
              >Cancel</button>
              <button
                onClick={handleDeleteAll}
                style={{
                  padding: "10px 26px", borderRadius: 6, border: "none",
                  background: "#b71c1c", color: "#fff", fontWeight: 800, cursor: 'pointer'
                }}
              >Delete All</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Unsubscribe Modal */}
      {showBulkUnsubscribeModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.25)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 28, minWidth: 340,
            boxShadow: "0 8px 32px #0002", textAlign: "center"
          }}>
            <div style={{ fontSize: 38, color: "#f57c00", marginBottom: 12 }}>🔕</div>
            <h2 style={{ margin: "0 0 12px 0", fontWeight: 700, fontSize: 22 }}>Unsubscribe Selected Contacts?</h2>
            <div style={{ color: "#555", marginBottom: 24 }}>
              This will mark <b>{selected.length}</b> selected contact{selected.length !== 1 ? 's' : ''} as unsubscribed.<br />
              They will no longer receive marketing campaign SMS.
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              <button
                onClick={() => setShowBulkUnsubscribeModal(false)}
                style={{
                  padding: "10px 26px", borderRadius: 6, border: "none",
                  background: "#eee", color: "#333", fontWeight: 600, cursor: 'pointer'
                }}
              >Cancel</button>
              <button
                onClick={handleBulkUnsubscribe}
                style={{
                  padding: "10px 26px", borderRadius: 6, border: "none",
                  background: "#f57c00", color: "#fff", fontWeight: 700, cursor: 'pointer'
                }}
              >Unsubscribe</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 32 }}>👥</span>
        <h1 style={{ margin: 0 }}>All Contacts</h1>
        {/* Filter by Group */}
        <div style={{ minWidth: 180 }}>
          <label style={{ fontWeight: 500, marginRight: 6 }}>Group:</label>
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', minWidth: 120 }}
          >
            <option value="">All Groups</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.group_name}</option>
            ))}
          </select>
        </div>
        {/* Filter by Address State */}
        <div style={{ minWidth: 180 }}>
          <label style={{ fontWeight: 500, marginRight: 6 }}>State:</label>
          <select
            value={filterState}
            onChange={e => setFilterState(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', minWidth: 120 }}
          >
            <option value="">All States</option>
            {addressStates.map(s => (
              <option key={s.id} value={s.id}>{s.state}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input id="filter-unsubscribed" type="checkbox" checked={filterUnsubscribed} onChange={e => setFilterUnsubscribed(e.target.checked)} />
          <label htmlFor="filter-unsubscribed" style={{ fontSize: 14, color: '#444' }}>Show unsubscribed only</label>
        </div>
        {/* Search box */}
        <div style={{ flex: '0 0 320px', minWidth: 200 }}>
          <input
            aria-label="Search contacts by name or phone"
            placeholder="Search by name or phone"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd' }}
          />
        </div>
        <button
          className="btn btn-create btn-fixed-radius"
          style={{
            background: "#46aa42",
            color: "#fff",
            border: "none",
            padding: "6px 20px",
            height: 34,
            lineHeight: '20px',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 16,
            cursor: "pointer",
            marginLeft: "auto",
            display: 'inline-flex',
            alignItems: 'center',
            verticalAlign: 'middle'
          }}
          onClick={() => setShowAddModal(true)}
        >
          Add New Contact
        </button>
        {/* Export contacts (uses server-side filtered export) */}
  <button
          onClick={() => {
            // open export modal with defaults from current filters
            setExportGroups(filterGroup ? [String(filterGroup)] : []);
            setExportStates(filterState ? [String(filterState)] : []);
            setExportStatus(filterUnsubscribed ? 'unsubscribed' : 'all');
            setExportPreviewCount(null);
            setExportModalOpen(true);
          }}
          style={{
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            padding: '6px 18px',
            height: 34,
            lineHeight: '20px',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            marginLeft: 12,
            display: 'inline-flex',
            alignItems: 'center',
            verticalAlign: 'middle'
          }}
          title="Export contacts"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
              <path d="M12 3v12" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 11l4 4 4-4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 21H3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export
          </span>
        </button>
  {/* Delete All Contacts button removed per request */}
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="compact-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: 12, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={filteredContacts.length > 0 && selected.length === filteredContacts.map(c=>c.id).length}
                    style={{ width: 18, height: 18 }}
                  />
                </th>
                <th style={{ padding: 12 }}>ID</th>
                <th style={{ padding: 12 }}>First Name</th>
                <th style={{ padding: 12 }}>Last Name</th>
                <th style={{ padding: 12 }}>Primary No</th>
                <th style={{ padding: 12 }}>Email</th>
                <th style={{ padding: 12 }}>Group</th>
                <th style={{ padding: 12 }}>Address State</th>
                <th style={{ padding: 12 }}>Subscribed</th>
                <th style={{ padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: 24 }}>No contacts found.</td>
                </tr>
              ) : (
          paginatedContacts.map((contact, idx) => (
            <tr key={contact.id} style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? '#fff' : '#f7f7f7' }}>
                    <td style={{ padding: 12, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(contact.id)}
                        onChange={() => handleSelect(contact.id)}
                        style={{ width: 18, height: 18 }}
                      />
                    </td>
                    <td style={{ padding: 12 }}>{contact.id}</td>
                    <td style={{ padding: 12 }}>
                      {editId === contact.id ? (
                        <input
                          name="first_name"
                          value={editData.first_name}
                          onChange={handleChange}
                        />
                      ) : contact.first_name}
                    </td>
                    <td style={{ padding: 12 }}>
                      {editId === contact.id ? (
                        <input
                          name="last_name"
                          value={editData.last_name}
                          onChange={handleChange}
                        />
                      ) : contact.last_name}
                    </td>
                    <td style={{ padding: 12 }}>
                      {editId === contact.id ? (
                        <input
                          name="primary_no"
                          value={editData.primary_no}
                          onChange={handleChange}
                        />
                      ) : contact.primary_no}
                    </td>
                    <td style={{ padding: 12 }}>
                      {editId === contact.id ? (
                        <input
                          name="email_add"
                          value={editData.email_add}
                          onChange={handleChange}
                        />
                      ) : contact.email_add}
                    </td>
                    <td style={{ padding: 12 }}>
                      {editId === contact.id ? (
                        <select
                          name="group_no"
                          value={editData.group_no || ""}
                          onChange={handleChange}
                        >
                          <option value="">Select group</option>
                          {groups.map(g => (
                            <option key={g.id} value={g.id}>
                              {g.group_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        groups.find(g => g.id === Number(contact.group_no))?.group_name || contact.group_no
                      )}
                    </td>
                    <td style={{ padding: 12 }}>
                      {editId === contact.id ? (
                        <select
                          name="address_state"
                          value={editData.address_state || ""}
                          onChange={handleChange}
                        >
                          <option value="">Select state</option>
                          {addressStates.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.state}
                            </option>
                          ))}
                        </select>
                      ) : (
                        addressStates.find(s => s.id === Number(contact.address_state))?.state || contact.address_state
                      )}
                    </td>
                    <td style={{ padding: 12 }}>
                      {editId === contact.id ? (
                        <select
                          name="is_subscribed"
                          value={editData.is_subscribed ? 1 : 0}
                          onChange={e => setEditData({ ...editData, is_subscribed: Number(e.target.value) })}
                        >
                          <option value={1}>Yes</option>
                          <option value={0}>No</option>
                        </select>
                      ) : (
                        contact.is_subscribed ? (
                          <span style={{ color: '#46aa42', fontWeight: 600 }}>Yes</span>
                        ) : (
                          <span style={{ color: '#d32f2f', fontWeight: 600 }}>No</span>
                        )
                      )}
                    </td>
                    <td style={{ padding: 12 }}>
                      {editId === contact.id ? (
                        <>
                          <button
                            className="btn btn-save no-icon"
                            onClick={handleSave}
                            style={{
                              marginRight: 8,
                              color: "#fff",
                              background: "#46aa42",
                              border: "none",
                              padding: "4px 12px",
                              borderRadius: 4,
                              display: "inline-flex",
                              alignItems: "center",
                              transition: "none",
                            }}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-cancel no-icon"
                            onClick={handleCancel}
                            style={{
                              color: "#fff",
                              background: "#888",
                              border: "none",
                              padding: "4px 12px",
                              borderRadius: 4,
                              display: "inline-flex",
                              alignItems: "center",
                              transition: "none",
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {/* per-row Send button (restores missing functionality) */
                          }
                          <button
                            className="action-btn action-btn--send"
                            onClick={() => handleSendSms(contact)}
                            title="Send SMS"
                            style={{ marginRight: 8 }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M22 2L11 13" stroke="#0369a1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="#0369a1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                            <span>Send</span>
                          </button>

                          <button
                            className="btn no-icon btn-fixed-radius"
                            onClick={() => handleEdit(contact)}
                            style={{
                              marginRight: 8,
                              color: "#fff",
                              background: "#46aa42",
                              border: "none",
                              padding: "4px 12px",
                              borderRadius: 4,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              transition: "none",
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "middle" }}>
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Edit
                          </button>
                          <button
                            className="btn no-icon btn-fixed-radius"
                            onClick={() => handleDelete(contact.id, `${contact.first_name || ''} ${contact.last_name || ''}`)}
                            style={{
                              color: "#fff",
                              background: "#d32f2f",
                              border: "none",
                              padding: "4px 12px",
                              borderRadius: 4,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              transition: "none",
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style={{ verticalAlign: "middle" }}>
                              <circle cx="12" cy="12" r="8" fill="#ffffff" />
                            </svg>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
          {/* Pagination Controls */}
          {filteredContacts.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '32px 0 0 0' }}>
              <nav aria-label="Contacts pagination">
                <ul style={{
                  display: 'flex',
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  gap: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  alignItems: 'center',
                }}>
                  <li>
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      style={{
                        background: currentPage === 1 ? '#eee' : '#fff',
                        color: '#46aa42',
                        border: '1px solid #46aa42',
                        borderRadius: 6,
                        padding: '6px 14px',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        marginRight: 2
                      }}
                    >
                      « First
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{
                        background: currentPage === 1 ? '#eee' : '#fff',
                        color: '#46aa42',
                        border: '1px solid #46aa42',
                        borderRadius: 6,
                        padding: '6px 14px',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        marginRight: 2
                      }}
                    >
                      ‹ Prev
                    </button>
                  </li>
                  {/* Page numbers, show up to 5 pages around current */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(pageNum =>
                      pageNum === 1 ||
                      pageNum === totalPages ||
                      (pageNum >= currentPage - 2 && pageNum <= currentPage + 2)
                    )
                    .map((pageNum, idx, arr) => (
                      <li key={pageNum}>
                        {/* Ellipsis for skipped pages */}
                        {idx > 0 && pageNum - arr[idx - 1] > 1 && (
                          <span style={{ margin: '0 4px', color: '#aaa' }}>…</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(pageNum)}
                          style={{
                            background: currentPage === pageNum ? '#46aa42' : '#fff',
                            color: currentPage === pageNum ? '#fff' : '#46aa42',
                            border: '1px solid #46aa42',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontWeight: currentPage === pageNum ? 700 : 600,
                            cursor: currentPage === pageNum ? 'default' : 'pointer',
                            transition: 'all 0.2s',
                            marginRight: 2
                          }}
                          disabled={currentPage === pageNum}
                        >
                          {pageNum}
                        </button>
                      </li>
                    ))}
                  <li>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        background: currentPage === totalPages ? '#eee' : '#fff',
                        color: '#46aa42',
                        border: '1px solid #46aa42',
                        borderRadius: 6,
                        padding: '6px 14px',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        marginLeft: 2
                      }}
                    >
                      Next ›
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      style={{
                        background: currentPage === totalPages ? '#eee' : '#fff',
                        color: '#46aa42',
                        border: '1px solid #46aa42',
                        borderRadius: 6,
                        padding: '6px 14px',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        marginLeft: 2
                      }}
                    >
                      Last »
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          )}
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.25)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 10,
            padding: 32,
            minWidth: 400,
            boxShadow: "0 4px 24px #e0e0e0",
            position: "relative"
          }}>
            <h2 style={{ marginTop: 0, marginBottom: 18, color: "#46aa42" }}>Add New Contact</h2>
            <form onSubmit={handleAddSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label>First Name</label>
                <input
                  name="first_name"
                  value={addForm.first_name}
                  onChange={handleAddChange}
                  required
                  style={{ width: "100%", padding: 8, marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>Last Name</label>
                <input
                  name="last_name"
                  value={addForm.last_name}
                  onChange={handleAddChange}
                  required
                  style={{ width: "100%", padding: 8, marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>Primary No</label>
                <input
                  name="primary_no"
                  value={addForm.primary_no}
                  onChange={handleAddChange}
                  required
                  style={{ width: "100%", padding: 8, marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>Email Address</label>
                <input
                  name="email_add"
                  value={addForm.email_add}
                  onChange={handleAddChange}
                  required
                  type="email"
                  style={{ width: "100%", padding: 8, marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>Group</label>
                <select
                  name="group_no"
                  value={addForm.group_no}
                  onChange={handleAddChange}
                  required
                  style={{ width: "100%", padding: 8, marginTop: 4 }}
                >
                  <option value="">Select group</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.group_name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>Address State</label>
                <select
                  name="address_state"
                  value={addForm.address_state}
                  onChange={handleAddChange}
                  required
                  style={{ width: "100%", padding: 8, marginTop: 4 }}
                >
                  <option value="">Select state</option>
                  {addressStates.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.state}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label>Subscribed</label>
                <select
                  name="is_subscribed"
                  value={addForm.is_subscribed}
                  onChange={handleAddChange}
                  style={{ width: "100%", padding: 8, marginTop: 4 }}
                >
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  className="btn btn-cancel"
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    background: "#888",
                    color: "#fff",
                    border: "none",
                    padding: "8px 18px",
                    borderRadius: 5,
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: "pointer"
                  }}
                  disabled={addLoading}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-create"
                  type="submit"
                  style={{
                    background: "#46aa42",
                    color: "#fff",
                    border: "none",
                    padding: "8px 18px",
                    borderRadius: 5,
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: addLoading ? "not-allowed" : "pointer"
                  }}
                  disabled={addLoading}
                >
                  {addLoading ? "Adding..." : "Add Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Export Modal */}
      {exportModalOpen && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.25)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:10, padding:22, minWidth:420, boxShadow:'0 8px 30px rgba(0,0,0,0.12)' }}>
            <h2 style={{ marginTop:0 }}>Export Contacts</h2>
            <div style={{ marginBottom:12, color:'#666' }}>Choose filters to apply to the export. Click Preview to see how many records will be exported.</div>

            <div style={{ display:'flex', gap:12, marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontWeight:600 }}>Address States</label>
                <div style={{ marginTop:6 }}>
                  <Select
                    isMulti
                    options={addressStates.map(s => ({ value: String(s.id), label: s.state }))}
                    value={addressStates
                      .map(s => ({ value: String(s.id), label: s.state }))
                      .filter(opt => exportStates.includes(opt.value))}
                    onChange={selected => { setExportStates(selected ? selected.map(s => String(s.value)) : []); setExportPreviewCount(null); }}
                  />
                </div>
                <div style={{ color:'#999', marginTop:6, fontSize:12 }}>Multi-select supported.</div>
              </div>

              <div style={{ width:220 }}>
                <label style={{ fontWeight:600 }}>Groups</label>
                <div style={{ marginTop:6 }}>
                  <Select
                    isMulti
                    options={groups.map(g => ({ value: String(g.id), label: g.group_name }))}
                    value={groups.map(g => ({ value: String(g.id), label: g.group_name })).filter(opt => exportGroups.includes(opt.value))}
                    onChange={selected => { setExportGroups(selected ? selected.map(s => String(s.value)) : []); setExportPreviewCount(null); }}
                  />
                </div>
                <div style={{ color:'#999', marginTop:6, fontSize:12 }}>Multi-select supported.</div>
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontWeight:600 }}>Status</label>
              <select value={exportStatus} onChange={e => { setExportStatus(e.target.value); setExportPreviewCount(null); }} style={{ width:200, padding:8, marginLeft:8 }}>
                <option value="all">All</option>
                <option value="subscribed">Subscribed</option>
                <option value="unsubscribed">Unsubscribed</option>
              </select>
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:18 }}>
              <button onClick={() => setExportModalOpen(false)} style={{ padding:'8px 14px', borderRadius:6, border:'1px solid #ddd', background:'#fff', cursor:'pointer' }}>Cancel</button>
                                                     <button onClick={async () => {
                // preview
                setExportLoading(true);
                try {
                  const params = new URLSearchParams();
                  if (exportGroups.length) params.append('group_no', exportGroups.join(','));
                  if (exportStates.length) params.append('address_state', exportStates.join(','));
                  if (exportStatus && exportStatus !== 'all') params.append('status', exportStatus);
                  const res = await fetch(`${API_BASE_URL}/api/v1/contacts/export/preview?` + params.toString());
                  const json = await res.json();
                  setExportPreviewCount(json.count ?? 0);
                } catch (e) {
                  setExportPreviewCount(null);
                } finally { setExportLoading(false); }
              }} style={{ padding:'8px 14px', borderRadius:6, background:'#1976d2', color:'#fff', border:'none', cursor:'pointer' }}>
                {exportLoading ? 'Checking...' : 'Preview'}
              </button>
              <button
                onClick={async () => {
                  if (!exportPreviewCount || exportPreviewCount <= 0) return;
                  // perform export download
                  setExportLoading(true);
                  try {
                    const params = new URLSearchParams();
                    if (exportGroups.length) params.append('group_no', exportGroups.join(','));
                    if (exportStates.length) params.append('address_state', exportStates.join(','));
                    if (exportStatus && exportStatus !== 'all') params.append('status', exportStatus);
                    // use absolute API path on the current host
                    const url = `${API_BASE_URL}/api/v1/contacts/export` + (params.toString() ? `?${params.toString()}` : '');
                    // trigger download in browser
                    window.location.href = url;
                  } catch (e) {
                    // ignore
                  } finally { setExportLoading(false); setExportModalOpen(false); }
                }}
                disabled={!exportPreviewCount || exportPreviewCount <= 0}
                style={{
                  padding:'8px 14px', borderRadius:6, background:'#46aa42', color:'#fff', border:'none',
                  cursor: (!exportPreviewCount || exportPreviewCount <= 0) ? 'not-allowed' : 'pointer',
                  opacity: (!exportPreviewCount || exportPreviewCount <= 0) ? 0.6 : 1
                }}
              >
                Export
              </button>
            </div>

            {exportPreviewCount !== null && (
              <div style={{ marginTop:12, color:'#333' }}>Preview: <strong>{exportPreviewCount}</strong> record{exportPreviewCount !== 1 ? 's' : ''} will be exported.</div>
            )}
            {exportPreviewCount === null && (
              <div style={{ marginTop:12, color:'#999' }}>Click Preview to compute how many records will be exported. Export is disabled until preview succeeds.</div>
            )}
          </div>
        </div>
      )}
      {/* Slide-in Send SMS composer panel (mirroring inbox preview style) */}
      {composerContact && (
        <>
          <div onClick={() => closeComposerWithAnimation()} style={{ position: 'fixed', left: 0, top: 0, bottom: 0, right: composerIsMobile ? 0 : 480, background: composerVisible ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0)', zIndex: 1300, pointerEvents: composerVisible ? 'auto' : 'none', transition: 'background 280ms ease', willChange: 'background' }} />

          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: composerIsMobile ? '100%' : 480, zIndex: 1301, display: 'flex', flexDirection: 'column', background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,0.12)', transform: composerVisible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 280ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease', opacity: composerVisible ? 1 : 0, willChange: 'transform, opacity', fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Send SMS</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => closeComposerWithAnimation()} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>✖</button>
              </div>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }}>
              <div style={{ color: '#888', fontSize: 12 }}>To</div>
              <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>{composerContact.first_name} {composerContact.last_name} — {composerContact.primary_no}</div>

              <div style={{ marginTop: 6, color: '#888', fontSize: 12 }}>Message</div>
              <textarea placeholder="Write your message..." value={composerBody} onChange={e => setComposerBody(e.target.value)} style={{ width: '100%', height: 140, padding: 8, borderRadius: 6, border: '1px solid #e6e6e6', boxSizing: 'border-box', resize: 'vertical' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ color: '#888', fontSize: 13 }}>
                  {composerBody.length} characters • {composerTotalSegments()} segment{composerTotalSegments() !== 1 ? 's' : ''}
                  {twilioBalanceLoading ? ' • checking balance...' : twilioBalance !== null ? ` • ${formatCurrency(twilioBalance)} available` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 13 }}>
                      {composerContact ? (
                        <span style={{ color: twilioBalance !== null && costEstimate(composerTotalSegments(), 1) > twilioBalance ? '#b71c1c' : '#666' }}>
                          Est: {formatCurrency(costEstimate(composerTotalSegments(), 1))}
                        </span>
                      ) : (
                        <span>
                          Est: {formatCurrency(PRICE_PER_SEGMENT * smsSegmentsForText(composerBody))} per recipient — select a contact to see total
                        </span>
                      )}
                    </div>
                  <button onClick={() => closeComposerWithAnimation()} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e6e6e6', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                  <button
                    onClick={sendComposerMessage}
                    style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#46aa42', color: '#fff', cursor: (composerBody.trim() === '' || (twilioBalance !== null && costEstimate(composerTotalSegments(), 1) > twilioBalance)) ? 'not-allowed' : 'pointer' }}
                    disabled={composerBody.trim() === '' || (twilioBalance !== null && costEstimate(composerTotalSegments(), 1) > twilioBalance)}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {/* Bulk send composer panel (for selected contacts) */}
      {bulkComposerVisible && (
        <>
          <div onClick={() => { setBulkComposerVisible(false); }} style={{ position: 'fixed', left: 0, top: 0, bottom: 0, right: bulkComposerIsMobile ? 0 : 480, background: bulkComposerVisible ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0)', zIndex: 1300, pointerEvents: bulkComposerVisible ? 'auto' : 'none', transition: 'background 280ms ease', willChange: 'background' }} />

          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: bulkComposerIsMobile ? '100%' : 480, zIndex: 1301, display: 'flex', flexDirection: 'column', background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,0.12)', transform: bulkComposerVisible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 280ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease', opacity: bulkComposerVisible ? 1 : 0, willChange: 'transform, opacity', fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>
            <div style={{ padding: 16, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Send SMS to Selected</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setBulkComposerVisible(false); }} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>✖</button>
              </div>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }}>
              <div style={{ color: '#888', fontSize: 12 }}>To</div>
              <div style={{ fontWeight: 700, letterSpacing: 0.2 }}>{selected.length} contact{selected.length !== 1 ? 's' : ''}</div>

              <div style={{ marginTop: 6, color: '#888', fontSize: 12 }}>Message</div>
              <textarea placeholder="Write your message for selected contacts..." value={bulkComposerBody} onChange={e => setBulkComposerBody(e.target.value)} style={{ width: '100%', height: 180, padding: 8, borderRadius: 6, border: '1px solid #e6e6e6', boxSizing: 'border-box', resize: 'vertical' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ color: '#888', fontSize: 13 }}>
                  {bulkComposerBody.length} characters • {smsSegmentsForText(bulkComposerBody)} segment{smsSegmentsForText(bulkComposerBody) !== 1 ? 's' : ''}
                  {twilioBalanceLoading ? ' • checking balance...' : twilioBalance !== null ? ` • ${formatCurrency(twilioBalance)} available` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 13 }}>
                    {selected.length === 0 ? (
                      <span>
                        Est: {formatCurrency(PRICE_PER_SEGMENT * smsSegmentsForText(bulkComposerBody))} per recipient — select recipients to see total
                      </span>
                    ) : (
                      <span style={{ color: twilioBalance !== null && costEstimate(bulkSelectedTotalSegments(), 1) > twilioBalance ? '#b71c1c' : '#666' }}>
                        Est: {formatCurrency(costEstimate(bulkSelectedTotalSegments(), 1))}
                      </span>
                    )}
                  </div>
                  <button onClick={() => { setBulkComposerVisible(false); }} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e6e6e6', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                  <button
                    onClick={sendBulkToSelected}
                    style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1976d2', color: '#fff', cursor: (bulkComposerBody.trim() === '' || processing || (twilioBalance !== null && costEstimate(bulkSelectedTotalSegments(), 1) > twilioBalance)) ? 'not-allowed' : 'pointer' }}
                    disabled={bulkComposerBody.trim() === '' || processing || (twilioBalance !== null && costEstimate(bulkSelectedTotalSegments(), 1) > twilioBalance)}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}