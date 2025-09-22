import { useEffect, useState, useRef } from "react";
import Select from "react-select";
import API_BASE_URL from "../../utils/apiConfig";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import IconNotePencil from '../../components/IconNotePencil';

export default function CreateSMS() {
  const textareaRef = useRef(null);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [states, setStates] = useState([]);
  const [recipientType, setRecipientType] = useState("person");
  const [recipients, setRecipients] = useState([]); // array of selected options
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [twilioBalance, setTwilioBalance] = useState(null);
  const [twilioCurrency, setTwilioCurrency] = useState('');
  const [twilioBalanceLoading, setTwilioBalanceLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch(`${API_BASE_URL}/v1/contacts`)
      .then(res => res.json())
      .then(data => setContacts(Array.isArray(data) ? data : []));
    fetch(`${API_BASE_URL}/v1/groups`)
      .then(res => res.json())
      .then(data => setGroups(Array.isArray(data) ? data : []));
    fetch(`${API_BASE_URL}/v1/address-states`)
      .then(res => res.json())
      .then(data => setStates(Array.isArray(data) ? data : []));
  // fetch saved templates so they can be applied to the composer
  fetch(`${API_BASE_URL}/api/v1/campaign-templates`).then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : [])).catch(()=>{});
  // fetch twilio balance for estimating SMS cost
  setTwilioBalanceLoading(true);
  fetch(`${API_BASE_URL}/api/v1/twilio/balance`).then(r => r.json()).then(b => {
    if (b && typeof b.balance !== 'undefined') {
      setTwilioBalance(b.balance);
      setTwilioCurrency(b.currency || '');
    }
  }).catch(()=>{}).finally(() => setTwilioBalanceLoading(false));
  }, []);

  // helpers: SMS segments calculation (GSM vs UCS-2 detection)
  const isGsmCompatible = (text) => {
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
    return segments * recipients * PRICE_PER_SEGMENT;
  };

  // compute total estimated cost including per-contact unsubscribe link appended
  const totalEstimatedForCreate = () => {
    if (recipientType === 'person') {
      // sum segments for each selected contact with their unsubscribe link appended
      if (!recipients || recipients.length === 0) return 0;
      let totalSegments = 0;
      recipients.forEach(r => {
        const contact = contacts.find(c => c.id === r.value);
        const link = contact && contact.unsubscribe_link ? contact.unsubscribe_link : '';
        const body = message + (link ? "\nOpt out link : " + link : '');
        totalSegments += smsSegmentsForText(body);
      });
      return costEstimate(totalSegments, 1);
    }
    // group or state: compute exact by enumerating contacts that match
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
      const link = c.unsubscribe_link || '';
      const body = message + (link ? "\nOpt out link : " + link : '');
      totalSegments += smsSegmentsForText(body);
    });
    return costEstimate(totalSegments, 1);
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

  const handleSend = async (e) => {
    e.preventDefault();
    if (!recipients.length) {
      toast.error("Please select at least one recipient.", { theme: "colored" });
      return;
    }
    if (!message.trim()) {
      toast.error("Message cannot be empty.", { theme: "colored" });
      return;
    }
    setSending(true);

    if (recipientType === "person") {
      const payload =
        recipients.length === 1
          ? {
              contact_id: recipients[0].value,
              message_body: message,
            }
          : {
              contact_id: recipients.map((r) => r.value),
              message_body: message,
            };
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/v1/outbound/send`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      setSending(false);
      if (res.ok) {
        setMessage("");
        setRecipients([]);
        toast.success("SMS sent successfully!", { theme: "colored" });
      } else {
        toast.error("Failed to send SMS.", { theme: "colored" });
      }
    } else if (recipientType === "group") {
      const payload = {
        group_ids: recipients.map((r) => r.value),
        message_body: message,
      };
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/v1/outbound/send-to-groups`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      setSending(false);
      if (res.ok) {
        setMessage("");
        setRecipients([]);
        toast.success("SMS sent to group(s)!", { theme: "colored" });
      } else {
        toast.error("Failed to send SMS to group(s).", { theme: "colored" });
      }
    } else if (recipientType === "state") {
      const payload = {
        address_states: recipients.map((r) => r.value),
        message_body: message,
      };
      const token = typeof window !== 'undefined' ? localStorage.getItem('msd_token') : null;
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/v1/outbound/send-by-state`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      setSending(false);
      if (res.ok) {
        setMessage("");
        setRecipients([]);
        toast.success("SMS sent to address state(s)!", { theme: "colored" });
      } else {
        toast.error("Failed to send SMS to address state(s).", { theme: "colored" });
      }
    }
  };

  // Prepare options for react-select
  const contactOptions = contacts.map(c => ({
    value: c.id,
    label: `${c.first_name} ${c.last_name} (${c.primary_no})`
  }));
  const groupOptions = groups.map(g => ({
    value: g.id,
    label: g.group_name
  }));
  const stateOptions = states.map(s => ({
    value: s.id,
    label: s.state
  }));

  const templateOptions = templates.map(t => ({ value: t.id, label: t.name }));

  const applySelectedTemplate = () => {
    if (!selectedTemplate) return;
    const tpl = templates.find(t => t.id === selectedTemplate.value);
    if (!tpl) return;
    // populate message
    setMessage(tpl.message || '');
    // set recipient type and recipients if present
    const rtype = tpl.recipient_type || 'person';
    setRecipientType(rtype);
    const recIds = Array.isArray(tpl.recipients) ? tpl.recipients.map(x => Number(x)) : [];
    if (recIds.length === 0) {
      setRecipients([]);
      return;
    }
    if (rtype === 'person') {
      const vals = contacts.filter(c => recIds.includes(c.id)).map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.primary_no})` }));
      setRecipients(vals);
    } else if (rtype === 'group') {
      const vals = groups.filter(g => recIds.includes(g.id)).map(g => ({ value: g.id, label: g.group_name }));
      setRecipients(vals);
    } else if (rtype === 'state') {
      const vals = states.filter(s => recIds.includes(s.id)).map(s => ({ value: s.id, label: s.state }));
      setRecipients(vals);
    } else {
      setRecipients([]);
    }
  };

  const clearSelectedTemplate = () => {
    setSelectedTemplate(null);
  };

  return (
    <div style={{
      maxWidth: 520,
      margin: "40px auto",
      background: "#fff",
      padding: 32,
      borderRadius: 14,
      boxShadow: "0 4px 24px #e0e0e0"
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 12, fontSize:24 }} aria-hidden="true">
          ✍️
        </span>
        <h1 style={{ margin: 0, fontWeight: 700, fontSize: 32 }}>Create SMS</h1>
      </div>
      {/* Template picker: allow loading a saved template into the composer */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ minWidth: 260 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Load Template</label>
          <Select
            isClearable
            value={selectedTemplate}
            onChange={setSelectedTemplate}
            options={templateOptions}
            placeholder="Select a template to load..."
            styles={{ control: provided => ({ ...provided, minHeight: 44 }) }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn" onClick={applySelectedTemplate} disabled={!selectedTemplate} style={{ padding: '8px 12px' }}>Apply</button>
          <button className="btn btn-cancel" onClick={clearSelectedTemplate} style={{ padding: '8px 12px' }}>Clear</button>
        </div>
      </div>
      <form
        onSubmit={handleSend}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
          }
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>Send To</label>
          <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="recipientType"
                value="person"
                checked={recipientType === "person"}
                onChange={() => { setRecipientType("person"); setRecipients([]); }}
              />
              Person
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="recipientType"
                value="group"
                checked={recipientType === "group"}
                onChange={() => { setRecipientType("group"); setRecipients([]); }}
              />
              Group
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="recipientType"
                value="state"
                checked={recipientType === "state"}
                onChange={() => { setRecipientType("state"); setRecipients([]); }}
              />
              Address States
            </label>
          </div>
          {mounted && (
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
                menu: provided => ({ ...provided, zIndex: 9999 }),
                control: provided => ({ ...provided, minHeight: 48 })
              }}
            />
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>Message</label>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 6,
              border: "1px solid #ccc",
              fontSize: 16,
              resize: "vertical",
              whiteSpace: "pre-wrap" // ensure textarea preserves newlines (visual only)
            }}
            placeholder="Type your SMS message here..."
            required
          />
          {/* Live preview that preserves newlines like the Campaign preview */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>Preview</label>
            <div style={{
              minHeight: 60,
              borderRadius: 6,
              border: "1px solid #e6e6e6",
              padding: 12,
              background: "#fafafa",
              color: "#111",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}>
              {message && message.length ? message : "Your message preview will appear here."}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ color: '#888', fontSize: 13 }}>{message.length} characters • {smsSegmentsForText(message)} segment{smsSegmentsForText(message) !== 1 ? 's' : ''}</div>
            <div style={{ color: '#888', fontSize: 13 }}>
              {recipientCount() === 0 ? (
                <span>
                  Est: {formatCurrency(costEstimate(smsSegmentsForText(message), 1))} per recipient — select recipients to see total
                </span>
              ) : (
                <span style={{ color: twilioBalance !== null && totalEstimatedForCreate() > twilioBalance ? '#b71c1c' : '#888' }}>
                  Est: {formatCurrency(totalEstimatedForCreate())}{twilioBalance !== null ? ` • ${formatCurrency(twilioBalance)} available` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          type="submit"
          className="btn btn-force-padding"
          disabled={sending || (twilioBalance !== null && totalEstimatedForCreate() > twilioBalance)}
          style={{
            width: "100%",
            background: "#46aa42",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 18,
            cursor: (sending || (twilioBalance !== null && totalEstimatedForCreate() > twilioBalance)) ? "not-allowed" : "pointer",
            boxShadow: "0 2px 8px #e0e0e0"
          }}
        >
          {sending ? "Sending..." : "Send SMS"}
        </button>
      </form>
        <div style={{
        marginTop: 32,
        background: "#f4f8f4",
        borderRadius: 8,
        padding: 18,
        color: "#555",
        fontSize: 15
      }}>
        <strong>Tips:</strong>
        <ul style={{ margin: "8px 0 0 18px" }}>
          <li>Choose one or more people, groups, or address states to send your SMS.</li>
          <li>Messages can span multiple SMS segments; cost is estimated below.</li>
          <li>Sending to a group or state will deliver the SMS to all members/contacts.</li>
        </ul>
      </div>
    </div>
  );
}