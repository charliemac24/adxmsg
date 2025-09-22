import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import API_BASE_URL from "../../utils/apiConfig";
import { toast } from "react-toastify";
import "react-datepicker/dist/react-datepicker.css";

function fmtDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString();
}

// Nicely formatted absolute date like: "Sep 1, 2025, 06:10 PM"
function formatNiceDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// badge style helper for campaign status labels (uses blue for Sent to match screenshot)
function badgeStyleFor(status) {
  const s = (status || '').toString().toLowerCase();
  if (s.includes('sent')) {
    return { color: '#1565c0', background: '#e9f2ff' }; // blue pill like screenshot
  }
  if (s.includes('delivered') || s.includes('deliv')) {
    return { color: '#065f46', background: '#d1fae5' }; // green
  }
  if (s.includes('fail') || s.includes('failed') || s.includes('error')) {
    return { color: '#991b1b', background: '#fee2e2' }; // red
  }
  return { color: '#1f2937', background: '#f3f4f6' }; // neutral
}

// Confirmation modal used for bulk delete
function ConfirmModal({ show, onConfirm, onCancel, count }) {
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.25)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: 32, minWidth: 340,
        boxShadow: "0 8px 32px #0002", textAlign: "center"
      }}>
        <div style={{ fontSize: 38, color: "#e74c3c", marginBottom: 12 }}>🗑️</div>
        <h2 style={{ margin: "0 0 12px 0", fontWeight: 700, fontSize: 22 }}>Delete {count} campaign{count !== 1 ? "s" : ""}?</h2>
        <div style={{ color: "#555", marginBottom: 24 }}>
          Are you sure you want to delete the selected campaign{count !== 1 ? "s" : ""}? This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <button className="btn btn-cancel" onClick={onCancel} style={{ padding: "10px 28px", borderRadius: 6, border: "none", background: "#eee", color: "#222", fontWeight: 600, fontSize: 16, cursor: "pointer" }}>Cancel</button>
          <button className="btn btn-delete" onClick={onConfirm} style={{ padding: "10px 28px", borderRadius: 6, border: "none", background: "#e74c3c", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// Attractive confirmation modal for creating templates
  function TemplateConfirmModal({ show, payload, onConfirm, onCancel }) {
  if (!show || !payload) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 120001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 520, borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.35)', background: 'linear-gradient(180deg,#fff,#fbfdfb)', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: 16, padding: 20, alignItems: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: 'linear-gradient(135deg,#46aa42,#7bd389)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, boxShadow: '0 6px 18px rgba(70,170,66,0.18)' }} aria-hidden>🎯</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1b5e20' }}>Create Template</div>
            <div style={{ marginTop: 6, color: '#3c3c3c' }}>You're about to create a reusable template from this campaign. Give it a name and confirm.</div>
          </div>
        </div>
        <div style={{ padding: 20, borderTop: '1px solid #f0f0f0', background: '#fff' }}>
          <div style={{ marginBottom: 12, fontWeight: 700 }}>{payload.name}</div>
          <div style={{ maxHeight: 120, overflow: 'auto', padding: 12, borderRadius: 8, background: '#f6f9f6', color: '#222', fontSize: 14, lineHeight: '1.4' }}>{payload.message || <em>No message</em>}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
            <button onClick={onConfirm} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(90deg,#46aa42,#2e9b3a)', color: '#fff', cursor: 'pointer', fontWeight: 800, boxShadow: '0 6px 18px rgba(46,155,58,0.18)' }}>Create Template</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Dynamic imports for client-side only
const Select = dynamic(() => import("react-select"), { ssr: false });
const DatePicker = dynamic(() => import("react-datepicker"), { ssr: false });

export default function Campaign() {
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [states, setStates] = useState([]);
  const [recipientType, setRecipientType] = useState("person");
  const [recipients, setRecipients] = useState([]);
  const [message, setMessage] = useState("");
  const messageRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiBtnRef = useRef(null);
  const pickerRef = useRef(null);
  // Fixed unsubscribe text to append and include in estimates
  const UNSUB_TEXT = "Opt out: adxmsg.com.au/s/u/1234";

  // Small emoji palette used by the picker
  const EMOJIS = [
    "😀","😃","😄","😁","😆","😅","😂","🤣","😊","🙂",
    "😉","😍","🤩","😘","🤔","😐","🙄","😴","🤯","😠",
    "👍","👎","👏","🙏","🎉","🔥","💯","🥳","💡","📣"
  ];

  // Insert emoji at caret in the message textarea (keeps focus & caret)
  const insertEmojiAtCursor = (emoji) => {
    const el = messageRef.current;
    if (!el) {
      setMessage((m) => (m || "") + emoji);
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const before = message.slice(0, start);
    const after = message.slice(end);
    const next = before + emoji + after;
    setMessage(next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      } catch (e) {}
    });
  };

  // Append the fixed unsubscribe text on its own line (idempotent) and focus the textarea
  const insertUnsubscribePlaceholder = () => {
    const cur = message || "";
    if (cur.includes(UNSUB_TEXT)) {
      try { messageRef.current?.focus(); } catch (e) {}
      return;
    }
    const needsNewLine = cur.length > 0 && !cur.endsWith("\n");
    const next = cur + (needsNewLine ? "\n" : "") + UNSUB_TEXT;
    setMessage(next);
    requestAnimationFrame(() => {
      try {
        const el = messageRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(next.length, next.length);
        }
      } catch (e) {}
    });
  };

  const [twilioBalance, setTwilioBalance] = useState(null);
  const [twilioCurrency, setTwilioCurrency] = useState('');
  const [twilioBalanceLoading, setTwilioBalanceLoading] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [sending, setSending] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [showPreviewPane, setShowPreviewPane] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [immediateSend, setImmediateSend] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [formattedDates, setFormattedDates] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [selectedCampaigns, setSelectedCampaigns] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [templateConfirm, setTemplateConfirm] = useState({ show: false, payload: null });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchCampaigns = () => {
    fetch(`${API_BASE_URL}/v1/campaigns`)
      .then((res) => res.json())
      .then((data) => setCampaigns(Array.isArray(data) ? data : []));
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/contacts`)
      .then((res) => res.json())
      .then((data) => setContacts(Array.isArray(data) ? data : []));
    fetch(`${API_BASE_URL}/v1/groups`)
      .then((res) => res.json())
      .then((data) => setGroups(Array.isArray(data) ? data : []));
    fetch(`${API_BASE_URL}/v1/address-states`)
      .then((res) => res.json())
      .then((data) => setStates(Array.isArray(data) ? data : []));
    fetchCampaigns();
    // fetch templates
    fetch(`${API_BASE_URL}/api/v1/campaign-templates`)
      .then((res) => res.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []));
    // fetch twilio balance
    setTwilioBalanceLoading(true);
    fetch(`${API_BASE_URL}/api/v1/twilio/balance`).then(r => r.json()).then(b => {
      if (b && typeof b.balance !== 'undefined') {
        setTwilioBalance(b.balance);
        setTwilioCurrency(b.currency || '');
      }
    }).catch(()=>{}).finally(() => setTwilioBalanceLoading(false));
  }, [mounted]);

  // SMS helpers (GSM vs UCS-2 detection and segments)
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

  const PRICE_PER_SEGMENT = 0.0515;
  const costEstimate = (segments, recipients) => {
    return Number(segments) * Number(recipients) * PRICE_PER_SEGMENT;
  };

  const formatCurrency = (amt) => {
    const v = Number(amt) || 0;
    return `${twilioCurrency || 'USD'} ${v.toFixed(4).replace(/\.0+$/,'')}`;
  };

  const recipientCount = () => {
    if (recipientType === 'person') return recipients.length;
    if (recipientType === 'group') {
      const ids = recipients.map(r => Number(r.value));
      return contacts.filter(c => ids.includes(Number(c.group_no))).length;
    }
    if (recipientType === 'state') {
      const vals = recipients.map(r => String(r.value));
      return contacts.filter(c => vals.includes(String(c.address_state))).length;
    }
    return 0;
  };

  useEffect(() => {
    if (!mounted) return;
    const fd = {};
    campaigns.forEach((camp) => {
      // prefer scheduled_at, fall back to created_at; format nicely
      fd[camp.id] = camp.scheduled_at
        ? formatNiceDate(camp.scheduled_at)
        : camp.created_at
        ? formatNiceDate(camp.created_at)
        : "";
    });
    setFormattedDates(fd);
  }, [campaigns, mounted]);

  // filtered campaigns according to header filterStatus
  const filteredCampaigns = campaigns.filter(c => {
    if (!filterStatus) return true;
    return (c.status || '').toString() === filterStatus;
  });

  // estimate total cost for current form and whether funds are insufficient
  // Compute exact per-recipient segments by appending each contact's unsubscribe_link
  const totalEstimatedCost = (() => {
     // if no recipients selected, nothing to estimate
     if (recipientCount() === 0) return 0;
 
     // handle person type by enumerating selected contacts
     if (recipientType === 'person') {
       if (!recipients || recipients.length === 0) return 0;
       let totalSegments = 0;
       recipients.forEach(r => {
         const contact = contacts.find(c => c.id === r.value);
         let body = message || '';
         // Ensure the fixed unsubscribe text is present for accurate estimation
         if (!body.includes(UNSUB_TEXT)) {
           if (!body.endsWith("\n") && body.length) body += "\n";
           body += UNSUB_TEXT;
         }
         totalSegments += smsSegmentsForText(body);
       });
       return costEstimate(totalSegments, 1);
     }
 
     // for group/state, enumerate matching contacts
     let matched = [];
     if (recipientType === 'group') {
       const ids = recipients.map(r => Number(r.value));
       matched = contacts.filter(c => ids.includes(Number(c.group_no)));
     } else if (recipientType === 'state') {
       const vals = recipients.map(r => String(r.value));
       matched = contacts.filter(c => vals.includes(String(c.address_state)));
     }
 
     if (!matched || matched.length === 0) return 0;
     let totalSegments = 0;
     matched.forEach(c => {
      let body = message || '';
      if (!body.includes(UNSUB_TEXT)) {
        if (!body.endsWith("\n") && body.length) body += "\n";
        body += UNSUB_TEXT;
      }
      totalSegments += smsSegmentsForText(body);
     });
     return costEstimate(totalSegments, 1);
   })();

  const insufficientFunds = twilioBalance !== null && totalEstimatedCost > twilioBalance;

  // number of draft campaigns for badge
  const draftCount = campaigns.filter(c => (c.status || '').toString() === 'Draft').length;

  // Single and bulk delete handlers
  const handleDeleteSelected = () => {
    if (selectedCampaigns.length === 0) return;
    setConfirmBulkDelete(true);
  };

  const confirmBulkDeleteAction = async () => {
    setConfirmBulkDelete(false);
    if (selectedCampaigns.length === 0) return;
    const ids = selectedCampaigns.map(Number);
    setBulkDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/campaigns/bulk-delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        // send campaign ids under the `campaign_id` parameter as requested
        body: JSON.stringify({ campaign_id: ids }),
      });
      setBulkDeleting(false);
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => !ids.includes(c.id)));
        setSelectedCampaigns([]);
        setSelectAll(false);
        toast.success(
          <div>
            <span style={{ fontSize: 22, marginRight: 8 }}>🗑️</span>
            <span style={{ fontWeight: 600 }}>Deleted {ids.length} campaign{ids.length !== 1 ? "s" : ""} successfully!</span>
          </div>,
          { theme: "colored" }
        );
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || "Bulk delete failed.", { theme: "colored" });
      }
    } catch (err) {
      setBulkDeleting(false);
      toast.error("Bulk delete failed.", { theme: "colored" });
    }
  };

  const handleSchedule = async (e) => {
    e.preventDefault();
    if (!campaignTitle.trim()) {
      toast.error("Please enter a campaign title.", { theme: "colored" });
      return;
    }
    if (!recipients.length) {
      toast.error("Please select at least one recipient.", { theme: "colored" });
      return;
    }
    if (!message.trim()) {
      toast.error("Message cannot be empty.", { theme: "colored" });
      return;
    }
    if (!immediateSend && !schedule) {
      toast.error("Please select a schedule date and time.", { theme: "colored" });
      return;
    }
    setSending(true);

    try {
      const payload = {
        title: campaignTitle,
        message,
        recipient_type: recipientType,
        recipients: recipients.map((r) => r.value),
        scheduled_at: schedule
          ? schedule.toISOString().slice(0, 19).replace("T", " ")
          : null,
        immediate_send: immediateSend ? 1 : 0,
      };

      const url = editingCampaignId
        ? `${API_BASE_URL}/api/v1/campaigns/${editingCampaignId}`
        : `${API_BASE_URL}/api/v1/campaigns`;

      const method = editingCampaignId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(
          immediateSend
            ? editingCampaignId
              ? "Campaign updated and sent successfully!"
              : "Campaign sent and saved successfully!"
            : editingCampaignId
            ? "Campaign updated successfully!"
            : "Campaign scheduled successfully!",
          { theme: "colored" }
        );

        // optionally save as template
        if (saveAsTemplate) {
          try {
            await fetch(`${API_BASE_URL}/api/v1/campaign-templates`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: campaignTitle,
                message,
                recipient_type: recipientType,
                recipients: recipients.map(r => r.value),
              }),
            });
            // refresh templates
            fetch(`${API_BASE_URL}/api/v1/campaign-templates`).then(r=>r.json()).then(data=>setTemplates(Array.isArray(data)?data:[])).catch(()=>{});
          } catch (err) {
            // ignore template save errors for now
          }
        }

        // reset form and state
        setMessage("");
        setRecipients([]);
        setSchedule(null);
        setCampaignTitle("");
        setImmediateSend(0);
        setShowForm(false);
        setEditingCampaignId(null);
        fetchCampaigns();
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to schedule campaign.", {
          theme: "colored",
        });
      }
    } catch (err) {
      toast.error("Failed to schedule campaign.", { theme: "colored" });
    }
    setSending(false);
  };

  const handleEditCampaign = (camp) => {
    // Allow editing for Sent, Scheduled, Draft etc. (we want sent campaigns to be editable so they can be saved as templates)
    setEditingCampaignId(camp.id);
    setCampaignTitle(camp.title || '');
    setMessage(camp.message || '');
    setRecipientType(camp.recipient_type || 'person');
    // map recipients into select value objects
    const mapRecipients = (type, ids) => {
      if (!ids) return [];
      if (type === 'person') return (ids || []).map(id => ({ value: id, label: contacts.find(c => c.id === id) ? `${contacts.find(c => c.id === id).first_name} ${contacts.find(c => c.id === id).last_name}` : `#${id}` }));
      if (type === 'group') return (ids || []).map(id => ({ value: id, label: groups.find(g => g.id === id) ? groups.find(g => g.id === id).group_name : `#${id}` }));
      if (type === 'state') return (ids || []).map(id => ({ value: id, label: states.find(s => s.id === id) ? states.find(s => s.id === id).state : `#${id}` }));
      return [];
    };
    setRecipients(mapRecipients(camp.recipient_type, camp.recipients || []));
    setSchedule(camp.scheduled_at ? new Date(camp.scheduled_at) : null);
    setImmediateSend(camp.immediate_send ? 1 : 0);
    setShowForm(true);
    if (camp.status === 'Sent') {
      toast.info('You are editing a sent campaign. Changes can be saved as a new campaign or converted to a template.', { theme: 'colored' });
    }
  };

  // Save current form as a Draft (do not schedule or send). If editing a Sent campaign, create a new Draft instead of modifying the sent record.
  const handleSaveDraftChanges = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!campaignTitle.trim()) {
      toast.error('Please enter a campaign title.', { theme: 'colored' });
      return;
    }
    if (!recipients.length) {
      toast.error('Please select at least one recipient.', { theme: 'colored' });
      return;
    }
    if (!message.trim()) {
      toast.error('Message cannot be empty.', { theme: 'colored' });
      return;
    }
    setSending(true);

    try {
      const payload = {
        title: campaignTitle,
        message,
        recipient_type: recipientType,
        recipients: recipients.map((r) => r.value),
        scheduled_at: schedule,
        immediate_send: 0,
        status: 'Draft',
      };

      // Primary draft endpoints
      const draftV1 = `${API_BASE_URL}/api/v1/campaigns/draft`;
      const draftApiV1 = `${API_BASE_URL}/api/v1/campaigns/draft`;

      // Robust fetch wrapper: returns an object even on network error
      const doFetch = async (url) => {
        try {
          return await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          console.error('Network/fetch error for', url, err);
          return { ok: false, status: 0, _networkError: true, _err: err };
        }
      };

      // Try v1 draft endpoint first, then fallback to api/v1 draft endpoint
      let res = await doFetch(draftV1);

      if (res && res._networkError) {
        try { res = await doFetch(draftApiV1); } catch (fallbackErr) { console.error('Fallback fetch error:', fallbackErr); }
      } else {
        const contentType = (res && res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
        if (res.status === 405 || (res.status >= 400 && !contentType.includes('application/json'))) {
          try { res = await doFetch(draftApiV1); } catch (fallbackErr) { console.error('Fallback fetch error:', fallbackErr); }
        }
      }

      // If network-level failure on both attempts
      if (!res || res._networkError) {
        toast.error('Failed to reach API. Check backend is running and API_BASE_URL is correct.', { theme: 'colored' });
        setSending(false);
        return;
      }

      if (res && res.ok) {
        toast.success('Campaign saved as Draft.', { theme: 'colored' });
        setMessage('');
        setRecipients([]);
        setSchedule(null);
        setCampaignTitle('');
        setImmediateSend(0);
        setShowForm(false);
        setEditingCampaignId(null);
        fetchCampaigns();
      } else {
        // if draft endpoints rejected (e.g. 405), try previous fallback (templates) or show server error
        if (res.status === 405) {
          // attempt template fallback like before
          const tplPayload = {
            name: campaignTitle || `Template ${Date.now()}`,
            message: message || '',
            recipient_type: recipientType || 'person',
            recipients: recipients.map((r) => r.value) || [],
          };
          try {
            let tRes = await fetch(`${API_BASE_URL}/v1/campaign-templates`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(tplPayload),
            }).catch(() => ({ ok: false, status: 0 }));
            if (!tRes || !tRes.ok) {
              tRes = await fetch(`${API_BASE_URL}/api/v1/campaign-templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tplPayload),
              }).catch(() => ({ ok: false, status: 0 }));
            }
            if (tRes && tRes.ok) {
              toast.success('Draft saved as template (fallback).', { theme: 'colored' });
              setMessage('');
              setRecipients([]);
              setSchedule(null);
              setCampaignTitle('');
              setImmediateSend(0);
              setShowForm(false);
              setEditingCampaignId(null);
              fetchCampaigns();
              setSending(false);
              return;
            }
          } catch (tplErr) {
            console.error('Template fallback error:', tplErr);
          }
        }

        const data = await (res ? res.json().catch(() => ({})) : Promise.resolve({}));
        toast.error(data.message || 'Failed to save draft.', { theme: 'colored' });
      }
    } catch (err) {
      console.error('Save draft error:', err);
      toast.error('Failed to save draft (network error).', { theme: 'colored' });
    }

    setSending(false);
  };

  // Save current form as a Template (does not schedule or send)
  const handleSaveAsTemplateFromForm = async () => {
    if (!campaignTitle.trim() && !message.trim()) {
      toast.error('Template needs a name or message.', { theme: 'colored' });
      return;
    }
    const payload = {
      name: campaignTitle || `Template ${Date.now()}`,
      message: message || '',
      recipient_type: recipientType || 'person',
      recipients: recipients.map((r) => r.value) || [],
    };
    setTemplateConfirm({ show: true, payload });
  };

  const confirmTemplateCreate = async () => {
    const p = templateConfirm.payload;
    if (!p) return setTemplateConfirm({ show: false, payload: null });
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/campaign-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      if (res.ok) {
        toast.success('Template created.', { theme: 'colored' });
        fetch(`${API_BASE_URL}/api/v1/campaign-templates`).then((r) => r.json()).then((data) => setTemplates(Array.isArray(data) ? data : [])).catch(() => {});
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || 'Failed to create template.', { theme: 'colored' });
      }
    } catch (err) {
      toast.error('Failed to create template (network).', { theme: 'colored' });
    }
    setTemplateConfirm({ show: false, payload: null });
  };

  const cancelTemplateCreate = () => setTemplateConfirm({ show: false, payload: null });

  // Convert an existing campaign into a template (simple, one-click)
  const handleConvertToTemplate = async (camp) => {
    if (!camp) return;
    const payload = {
      name: camp.title || `Campaign ${camp.id}`,
      message: camp.message || '',
      recipient_type: camp.recipient_type || 'person',
      recipients: camp.recipients || [],
    };
    setTemplateConfirm({ show: true, payload });
  };

  const contactOptions = contacts.map((c) => ({
    value: c.id,
    label: `${c.first_name} ${c.last_name} (${c.primary_no})`,
  }));
  const groupOptions = groups.map((g) => ({
    value: g.id,
    label: g.group_name,
  }));
  const stateOptions = states.map((s) => ({
    value: s.id,
    label: s.state,
  }));

  // Preview timestamp (shows scheduled time or now)
  const previewTimestamp = schedule
    ? (schedule instanceof Date ? schedule.toLocaleString() : new Date(schedule).toLocaleString())
    : new Date().toLocaleString();

  const getRecipientsDisplay = (campaign) => {
    if (!campaign.recipients || !Array.isArray(campaign.recipients)) return "";
    if (campaign.recipient_type === "person") {
      const selected = contacts.filter((c) => campaign.recipients.includes(c.id));
      return (
        <>
          Person: {selected.map((c) => `${c.first_name} ${c.last_name}`).join(", ")}
          <br />
          <span style={{ color: "#888" }}>
            {selected.length} contact{selected.length !== 1 ? "s" : ""}
          </span>
        </>
      );
    }
    if (campaign.recipient_type === "group") {
      const selected = groups.filter((g) => campaign.recipients.includes(g.id));
      const count = contacts.filter((c) => campaign.recipients.includes(c.group_no)).length;
      return (
        <>
          Group: {selected.map((g) => g.group_name).join(", ")}
          <br />
          <span style={{ color: "#888" }}>
            {count} contact{count !== 1 ? "s" : ""}
          </span>
        </>
      );
    }
    if (campaign.recipient_type === "state") {
      const selected = states.filter((s) => campaign.recipients.includes(s.id));
      const count = contacts.filter((c) => campaign.recipients.includes(c.address_state)).length;
      return (
        <>
          State: {selected.map((s) => s.state).join(", ")}
          <br />
          <span style={{ color: "#888" }}>
            {count} contact{count !== 1 ? "s" : ""}
          </span>
        </>
      );
    }
    return "";
  };

  // Popup/modal styles
  const modalOverlayStyle = {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.25)",
    zIndex: 120000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };
  const modalContentStyle = {
    background: "#fff",
    borderRadius: 8,
    padding: 24,
    minWidth: 700, // Increased from 500
    maxWidth: 900, // Increased from 700
    width: "100%",
    boxShadow: "0 1px 6px rgba(16,24,40,0.06)",
    position: "relative"
  };
  const closeBtnStyle = {
    position: "absolute",
    top: 16,
    right: 16,
    background: "none",
    border: "none",
    fontSize: 22,
    cursor: "pointer",
    color: "#888"
  };

  // Handle select all checkbox
  const handleSelectAll = (e) => {
    const checked = e.target.checked;
    setSelectAll(checked);
    // select only visible (filtered) campaigns so filtering works correctly
    const visible = filteredCampaigns && filteredCampaigns.length ? filteredCampaigns : campaigns;
    if (checked) {
      setSelectedCampaigns(visible.map((c) => c.id));
    } else {
      setSelectedCampaigns([]);
    }
  };
  
  // Handle individual row checkbox
  const handleSelectCampaign = (id) => {
    setSelectedCampaigns((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    // Keep selectAll in sync with selectedCampaigns relative to visible rows (respect filters)
    const visible = filteredCampaigns && filteredCampaigns.length ? filteredCampaigns : campaigns;
    if (visible.length > 0) {
      setSelectAll(selectedCampaigns.length === visible.length);
    } else {
      setSelectAll(false);
    }
  }, [selectedCampaigns, campaigns, filteredCampaigns]);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "#fff", /* make page background white for Campaigns */
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1800px",
          margin: "0 auto",
          padding: "40px 32px",
          boxSizing: "border-box",
          flex: 1,
        }}
      >
        
        <ConfirmModal
          show={confirmBulkDelete}
          onConfirm={confirmBulkDeleteAction}
          onCancel={() => setConfirmBulkDelete(false)}
          count={selectedCampaigns.length}
        />

        <TemplateConfirmModal
          show={templateConfirm.show}
          payload={templateConfirm.payload}
          onConfirm={() => {
            // perform creation and close
            (async () => {
              const p = templateConfirm.payload;
              try {
                const res = await fetch(`${API_BASE_URL}/api/v1/campaign-templates`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(p),
                });
                if (res.ok) {
                  toast.success('Template created.', { theme: 'colored' });
                  fetch(`${API_BASE_URL}/api/v1/campaign-templates`).then((r) => r.json()).then((data) => setTemplates(Array.isArray(data) ? data : [])).catch(() => {});
                } else {
                  const data = await res.json().catch(() => ({}));
                  toast.error(data.message || 'Failed to create template.', { theme: 'colored' });
                }
              } catch (err) {
                toast.error('Failed to create template (network).', { theme: 'colored' });
              }
              setTemplateConfirm({ show: false, payload: null });
            })();
          }}
          onCancel={() => setTemplateConfirm({ show: false, payload: null })}
        />

        {/* Bulk Action Section for Campaigns */}
        {selectedCampaigns.length > 0 && (
          <div style={{
            background: "#fff", /* keep bulk action area white */
            borderRadius: 8,
            padding: 12,
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            gap: 12
          }}>
            <span style={{ fontWeight: 600 }}>{selectedCampaigns.length} selected</span>
            <span style={{ color: "#888" }}>|</span>
            <button
              className="btn btn-delete"
              onClick={handleDeleteSelected}
              disabled={bulkDeleting}
              style={{
                background: "#d32f2f",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontWeight: 700,
                cursor: bulkDeleting ? "not-allowed" : "pointer"
              }}
            >
              {bulkDeleting ? "Deleting..." : "Delete Selected"}
            </button>
          </div>
        )}
        {/* Header with title and button */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32
        }}>
          <h2 style={{ fontWeight: 700, fontSize: 28, color: "#222", margin: 0 }}>
            <span style={{ fontSize: 28, marginRight: 8 }}>📋</span>
            All Campaigns
          </h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-hidden>
              <button onClick={() => setFilterStatus('')} style={{ padding: '6px 10px', borderRadius: 6, border: filterStatus === '' ? '1px solid #46aa42' : '1px solid #ddd', background: filterStatus === '' ? '#eaf8ee' : '#fff', cursor: 'pointer' }}>All</button>
              <button onClick={() => setFilterStatus('Draft')} style={{ padding: '6px 10px', borderRadius: 6, border: filterStatus === 'Draft' ? '1px solid #e07a3b' : '1px solid #ddd', background: filterStatus === 'Draft' ? '#fff4e6' : '#fff', cursor: 'pointer', position: 'relative' }}>
                Drafts
                {draftCount > 0 && (
                  <span style={{ position: 'absolute', top: -6, right: -8, background: '#e07a3b', color: '#fff', padding: '2px 6px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{draftCount}</span>
                )}
              </button>
              <button onClick={() => setFilterStatus('Scheduled')} style={{ padding: '6px 10px', borderRadius: 6, border: filterStatus === 'Scheduled' ? '1px solid #46aa42' : '1px solid #ddd', background: filterStatus === 'Scheduled' ? '#eaf8ee' : '#fff', cursor: 'pointer' }}>Scheduled</button>
              <button onClick={() => setFilterStatus('Sent')} style={{ padding: '6px 10px', borderRadius: 6, border: filterStatus === 'Sent' ? '1px solid #1976d2' : '1px solid #ddd', background: filterStatus === 'Sent' ? '#e9f2ff' : '#fff', cursor: 'pointer' }}>Sent</button>
            </div>
            <button
              className="btn"
              onClick={() => window.location.href = '/sms/templates'}
              style={{ background: '#fff', border: '1px solid #ddd', padding: '10px 14px' }}
            >Templates</button>
            <button
              className="btn btn-create btn-fixed-radius"
              onClick={() => setShowForm(true)}
            style={{
              background: "#46aa42",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 18,
              padding: "12px 28px",
              cursor: "pointer",
              boxShadow: "0 2px 8px #e0e0e0"
            }}
          >
            Create Campaign
          </button>
            </div>
          </div>

        {/* Modal Popup for Create Campaign */}
        {showForm && (
          <div style={modalOverlayStyle}>
            <div style={modalContentStyle}>
              <button
                className="btn icon-only btn-cancel"
                style={closeBtnStyle}
                onClick={() => setShowForm(false)}
                aria-label="Close"
                type="button"
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" width="18" height="18">
                  <path d="M6 6 L18 18 M18 6 L6 18" stroke="#444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </button>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
                <span style={{ fontSize: 36, marginRight: 12, color: "#46aa42" }}>📣</span>
                <h1 style={{ margin: 0, fontWeight: 700, fontSize: 28 }}>Create SMS Campaign</h1>
              </div>
              <div className="modal-flex" style={{ display: 'flex', gap: 48, alignItems: 'flex-start' }}>
                <form onSubmit={handleSchedule} style={{ flex: 1 }}>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>
                      Campaign Title
                    </label>
                    <input
                      type="text"
                      value={campaignTitle}
                      onChange={(e) => setCampaignTitle(e.target.value)}
                      placeholder="Enter campaign title"
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 6,
                        border: "1px solid #ccc",
                        fontSize: 16,
                      }}
                      required
                    />
                  </div>
                    {/* Templates picker */}
                    <div style={{ marginBottom: 18 }}>
                      <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>Templates</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={selectedTemplateId || ''}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            setSelectedTemplateId(id);
                            if (!id) return;
                            const tpl = templates.find(t => String(t.id) === String(id));
                            if (tpl) {
                              setCampaignTitle(tpl.name || '');
                              setMessage(tpl.message || '');
                              if (tpl.recipient_type) setRecipientType(tpl.recipient_type);
                              if (tpl.recipients) {
                                const mapRecipients = (type, ids) => {
                                  if (!ids) return [];
                                  if (type === 'person') return (ids || []).map(id => ({ value: id, label: contacts.find(c => c.id === id) ? `${contacts.find(c => c.id === id).first_name} ${contacts.find(c => c.id === id).last_name}` : `#${id}` }));
                                  if (type === 'group') return (ids || []).map(id => ({ value: id, label: groups.find(g => g.id === id) ? groups.find(g => g.id === id).group_name : `#${id}` }));
                                  if (type === 'state') return (ids || []).map(id => ({ value: id, label: states.find(s => s.id === id) ? states.find(s => s.id === id).state : `#${id}` }));
                                  return [];
                                };
                                setRecipients(mapRecipients(tpl.recipient_type || 'person', tpl.recipients || []));
                              }
                            }
                          }}
                          style={{ padding: 10, minWidth: 240 }}
                        >
                          <option value="">-- Choose a template --</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="checkbox" checked={saveAsTemplate} onChange={() => setSaveAsTemplate(s => !s)} /> Save as template
                        </label>
                      </div>
                    </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>Send To</label>
                    <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name="recipientType"
                          value="person"
                          checked={recipientType === "person"}
                          onChange={() => {
                            setRecipientType("person");
                            setRecipients([]);
                          }}
                        />
                        Person
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name="recipientType"
                          value="group"
                          checked={recipientType === "group"}
                          onChange={() => {
                            setRecipientType("group");
                            setRecipients([]);
                          }}
                        />
                        Group
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name="recipientType"
                          value="state"
                          checked={recipientType === "state"}
                          onChange={() => {
                            setRecipientType("state");
                            setRecipients([]);
                          }}
                        />
                        Address States
                      </label>
                    </div>
                    <Select
                      isMulti
                      options={
                        recipientType === "person"
                          ? contactOptions
                          : recipientType === "group"
                          ? groupOptions
                          : stateOptions
                      }
                      value={recipients}
                      onChange={setRecipients}
                      placeholder={
                        recipientType === "person"
                          ? "Select contacts..."
                          : recipientType === "group"
                          ? "Select groups..."
                          : "Select address states..."
                      }
                      styles={{
                        menu: (provided) => ({ ...provided, zIndex: 9999 }),
                        control: (provided) => ({ ...provided, minHeight: 48 }),
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>Message</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      ref={messageRef}
                      rows={5}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 6,
                        border: "1px solid #ccc",
                        fontSize: 16,
                        resize: "vertical",
                      }}
                      placeholder="Type your SMS message here..."
                      required
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                        marginTop: 8,
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', flex: '0 0 auto' }}>
                        <button
                          type="button"
                          onClick={insertUnsubscribePlaceholder}
                          aria-label="Insert unsubscribe placeholder"
                          style={{ border: '1px solid #e6e6e6', background: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                        >
                          Unsubscribe Link
                        </button>
                        <div style={{ position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => setShowEmojiPicker(s => !s)}
                            aria-label="Insert emoji"
                            style={{ border: '1px solid #e6e6e6', background: '#fff', padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 18 }}
                            ref={emojiBtnRef}
                          >
                            😊
                          </button>
                          {showEmojiPicker && (
                            <div
                              ref={pickerRef}
                              style={{
                                position: 'absolute',
                                top: 44,
                                left: 0,
                                width: 260,
                                background: '#fff',
                                border: '1px solid #e6e6e6',
                                boxShadow: '0 10px 28px rgba(2,6,23,0.12)',
                                padding: 8,
                                borderRadius: 10,
                                zIndex: 120000,
                                display: 'grid',
                                gridTemplateColumns: 'repeat(6, 1fr)',
                                gap: 8,
                                maxHeight: 220,
                                overflowY: 'auto',
                                boxSizing: 'border-box'
                              }}
                            >
                              {EMOJIS.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => insertEmojiAtCursor(em)}
                                  style={{
                                    width: 36,
                                    height: 36,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontSize: 20,
                                    padding: 0,
                                  }}
                                  aria-label={`Insert ${em}`}
                                >
                                  {em}
                                </button>
                              ))}
                              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
                                <button type="button" onClick={() => setShowEmojiPicker(false)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e6e6e6', cursor: 'pointer' }}>Close</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flex: '1 1 260px', minWidth: 180 }}>
                        <div style={{ color: '#444', fontSize: 13, fontWeight: 600 }}>{message.length} chars • {smsSegmentsForText(message)} segment{smsSegmentsForText(message) !== 1 ? 's' : ''}</div>
                        <div style={{ fontSize: 13, color: insufficientFunds ? '#b71c1c' : '#666' }}>
                          {recipientCount() === 0 ? (
                            <span>Est: {formatCurrency(costEstimate(smsSegmentsForText(message), 1))} per recipient — select recipients to see total</span>
                          ) : (
                            <span>Est: {formatCurrency(totalEstimatedCost)}{twilioBalance !== null ? ` • ${formatCurrency(twilioBalance)} available` : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {insufficientFunds && (
                      <div style={{ marginTop: 8, color: '#b71c1c', fontWeight: 700 }}>
                        Insufficient Twilio balance to send immediately — the campaign will be saved as Draft if you attempt to send now.
                      </div>
                    )}
                    {/* Preview toggle (preview pane is to the right) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={showPreviewPane} onChange={() => setShowPreviewPane(s => !s)} /> Show preview
                      </label>
                      <div style={{ color: '#888', fontSize: 13 }}>{/* placeholder for future meta like segments */}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>Schedule</label>
                    <DatePicker
                      selected={schedule}
                      onChange={setSchedule}
                      showTimeSelect
                      timeFormat="HH:mm"
                      timeIntervals={5}
                      dateFormat="MMMM d, yyyy h:mm aa"
                      minDate={new Date()}
                      placeholderText="Select date and time"
                      disabled={!!immediateSend}
                    />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: insufficientFunds ? 'not-allowed' : 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!immediateSend}
                            onChange={() => { if (!insufficientFunds) setImmediateSend(immediateSend ? 0 : 1); }}
                            style={{ width: 18, height: 18 }}
                            disabled={insufficientFunds}
                          />
                          <span>Send campaign immediately</span>
                        </label>
                        {insufficientFunds && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: '#b71c1c' }}>
                              <path d="M12 9v4" stroke="#b71c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M12 17h.01" stroke="#b71c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="12" cy="12" r="9" stroke="#b71c1c" strokeWidth="1.2" />
                            </svg>
                            <div style={{ fontSize: 13, color: '#666' }} title="Immediate send disabled because the estimated cost exceeds your Twilio balance. You can still save this campaign as Draft.">Why disabled?</div>
                          </div>
                        )}
                      </div>
                    <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                      If checked, the campaign will be sent right away and the schedule will be ignored.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={handleSaveDraftChanges}
                      disabled={sending}
                      className="btn btn-outline"
                      style={{
                        flex: 1,
                        padding: '12px 18px',
                        borderRadius: 6,
                        border: '1px solid #ddd',
                        background: '#fff',
                        cursor: sending ? 'not-allowed' : 'pointer',
                        fontWeight: 700
                      }}
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAsTemplateFromForm}
                      disabled={sending}
                      className="btn btn-outline"
                      style={{
                        flex: 1,
                        padding: '12px 18px',
                        borderRadius: 6,
                        border: '1px solid #ddd',
                        background: '#fff',
                        cursor: sending ? 'not-allowed' : 'pointer',
                        fontWeight: 700
                      }}
                    >
                      Save as Template
                    </button>
                  </div>

                  <button
                    className="btn btn-save btn-force-padding"
                    type="submit"
                    disabled={sending}
                    style={{
                      width: "100%",
                      background: "#46aa42",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: 18,
                      cursor: sending ? "not-allowed" : "pointer",
                      boxShadow: "0 2px 8px #e0e0e0"
                    }}
                  >
                    {sending
                      ? immediateSend
                        ? "Sending..."
                        : "Scheduling..."
                      : immediateSend
                      ? "Send Now"
                      : "Schedule Campaign"}
                  </button>
                </form>
                <div style={{ width: 360, flexShrink: 0 }}>
                  {showPreviewPane && (
                    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
                      <div className="preview-bezel" style={{ width: '100%', padding: 12, minHeight: 520, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                        {/* phone bezel top */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                          <div style={{ width: 56, height: 6, background: '#ddd', borderRadius: 4 }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 8, height: 8, background: '#cfcfcf', borderRadius: '50%' }} />
                            <div style={{ width: 6, height: 6, background: '#cfcfcf', borderRadius: '50%' }} />
                          </div>
                          <div style={{ fontSize: 12, color: '#999' }}>{previewTimestamp}</div>
                          <div style={{ width: 24 }} />
                        </div>
                        <div style={{ marginTop: 8, background: '#fff', padding: 12, borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', minHeight: 420, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>From: ADX MSG</div>
                            <div className="sms-bubble-wrapper">
                              <div
                                className="sms-bubble"
                                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                              >
                                {message || "Your message preview will appear here."}
                              </div>
                            </div>
                          </div>
                          <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12, color: '#888' }}>{message.length} chars</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Campaigns Table */}
        {!mounted ? (
          <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</div>
        ) : (
          <table className="compact-table"
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontFamily: "Segoe UI, Arial, sans-serif",
              background: "#fff",
              borderRadius: 3,
              boxShadow: "0 1px 6px rgba(16,24,40,0.06)",
              overflow: "hidden"
            }}
          >
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    aria-label="Select all campaigns"
                  />
                </th>
                <th>Campaign Name</th>
                <th>Status</th>
                <th>From</th>
                <th>Recipients</th>
                <th>Scheduled At</th>
                <th style={{ width: 80, textAlign: 'right' }} aria-label="Actions">
                  <span title="Actions" style={{ display: 'inline-block', width: 28, height: 28, lineHeight: '28px', textAlign: 'center', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 700 }}>⋯</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#888" }}>
                    No campaigns found.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((camp) => (
                  <tr
                    key={camp.id}
                    style={{
                      borderBottom: "1px solid #f0f0f0",
                      background: camp.status === "Scheduled" ? "#f9fff9" : "#fff",
                      transition: "background 0.2s",
                    }}
                  >
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedCampaigns.includes(camp.id)}
                        onChange={() => handleSelectCampaign(camp.id)}
                        aria-label={`Select campaign ${camp.title}`}
                      />
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#222", display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{camp.title}</span>
                      {camp.status === 'Draft' && (
                        <span style={{ background: '#fff4e6', color: '#e07a3b', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>Draft</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        color: camp.status === "Scheduled" ? "#46aa42" : "#888",
                        fontWeight: 600,
                      }}
                    >
                      {(() => {
                        const colors = badgeStyleFor(camp.status);
                        return (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '6px 12px',
                              borderRadius: 16,
                              fontSize: 13,
                              fontWeight: 500,
                              letterSpacing: 0.2,
                              color: colors.color,
                              background: colors.background
                            }}
                          >
                            {camp.status}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#444" }}>
                      {camp.from || "ADX MSG"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#444" }}>
                      {getRecipientsDisplay(camp)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#444" }}>
                      {mounted ? formattedDates[camp.id] || "" : ""}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="btn no-icon btn-fixed-radius"
                        onClick={() => handleEditCampaign(camp)}
                        style={{
                          background: camp.status === 'Sent' ? '#1976d2' : 'rgb(70,170,66)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 10px',
                          cursor: 'pointer',
                          fontWeight: 700,
                         display: 'inline-flex',
                         alignItems: 'center',
                         gap: 8,
                        }}
                      >
                       <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: "middle" }}>
                         <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                         <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                       </svg>
                        <span>Edit</span>
                      </button>
                      <button
                        className="btn no-icon btn-fixed-radius"
                        onClick={() => handleConvertToTemplate(camp)}
                        title="Create a reusable template from this campaign"
                        style={{
                          background: '#fff',
                          color: '#444',
                          border: '1px solid #ddd',
                          borderRadius: 6,
                          padding: '6px 10px',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                      >
                        Template
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
