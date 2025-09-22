import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import API_BASE_URL from '../../utils/apiConfig';
import { toast } from 'react-toastify';
const Select = dynamic(() => import('react-select'), { ssr: false });

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState('person');
  // recipients will be stored as an array of ids (numbers)
  const [recipients, setRecipients] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [states, setStates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchTemplates = () => {
    fetch(`${API_BASE_URL}/api/v1/campaign-templates`)
      .then(r => r.json())
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  // fetch lists for recipient picker
  fetch(`${API_BASE_URL}/v1/contacts`).then(r=>r.json()).then(d=>setContacts(Array.isArray(d)?d:[])).catch(()=>{});
  fetch(`${API_BASE_URL}/v1/groups`).then(r=>r.json()).then(d=>setGroups(Array.isArray(d)?d:[])).catch(()=>{});
  fetch(`${API_BASE_URL}/v1/address-states`).then(r=>r.json()).then(d=>setStates(Array.isArray(d)?d:[])).catch(()=>{});
  }, []);

  const handleEdit = (tpl) => {
    setEditing(tpl);
    setName(tpl.name || '');
    setMessage(tpl.message || '');
    setRecipientType(tpl.recipient_type || 'person');
  // ensure recipients are an array of ids
  setRecipients(Array.isArray(tpl.recipients) ? tpl.recipients.map(id => Number(id)) : []);
    setShowForm(true);
  };

  const handleDelete = async (tpl) => {
    if (!confirm(`Delete template "${tpl.name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/campaign-templates/${tpl.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Template deleted.');
        fetchTemplates();
      } else {
        const d = await res.json().catch(()=>({}));
        toast.error(d.message || 'Failed to delete.');
      }
    } catch (e) {
      toast.error('Failed to delete.');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name, message, recipient_type: recipientType, recipients };
      const url = editing ? `${API_BASE_URL}/api/v1/campaign-templates/${editing.id}` : `${API_BASE_URL}/api/v1/campaign-templates`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        toast.success(editing ? 'Template updated.' : 'Template created.');
        setShowForm(false);
        setEditing(null);
        setName(''); setMessage(''); setRecipientType('person'); setRecipients([]);
        fetchTemplates();
      } else {
        const d = await res.json().catch(()=>({}));
        toast.error(d.message || 'Failed to save template.');
      }
    } catch (err) {
      toast.error('Failed to save template.');
    }
    setSaving(false);
  };

  const charCount = message ? message.length : 0;

  return (
    <div style={{ padding: 24 }}>
      <h1>Campaign Templates</h1>
      {/* Brief instructions for using templates */}
      <div style={{ background: '#f4f6f7', border: '1px solid #e6e9ea', padding: 12, borderRadius: 6, marginBottom: 12, color: '#333' }}>
        <strong style={{ display: 'block', marginBottom: 6 }}>How to use templates</strong>
        <div style={{ fontSize: 13, color: '#444' }}>
          - Create a template by clicking "New Template" and filling in Name, Message, Recipient Type and Recipients, then Save.<br />
          - To use a saved template, open the Create SMS or Campaign page and select or paste the template message into the composer (edit if needed) before sending.<br />
          - Use Edit/Delete actions in the table to update or remove templates. Keep messages concise and verify recipients before sending.
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <button className="btn btn-create" onClick={() => { setShowForm(true); setEditing(null); setName(''); setMessage(''); setRecipientType('person'); setRecipients([]); }}>New Template</button>
      </div>

      {loading ? <div>Loading...</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8 }}>Name</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Message (preview)</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Recipients</th>
              <th style={{ textAlign: 'right', padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 20, color: '#888' }}>No templates</td></tr>
            ) : templates.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8, fontWeight: 700 }}>{t.name}</td>
                <td style={{ padding: 8, color: '#444' }}>{t.message.length > 120 ? t.message.slice(0, 120) + '…' : t.message}</td>
                <td style={{ padding: 8, color: '#666' }}>{t.recipient_type || '—'} {t.recipients ? `(${(t.recipients || []).length})` : ''}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>
                  <button className="btn" onClick={() => handleEdit(t)} style={{ marginRight: 8 }}>Edit</button>
                  <button className="btn btn-delete" onClick={() => handleDelete(t)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1200 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', padding: 22, width: 'min(880px, 96%)', maxWidth: 880, borderRadius: 10, boxShadow: '0 12px 30px rgba(16,24,40,0.18)', border: '1px solid rgba(15,23,42,0.06)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{editing ? 'Edit Template' : 'New Template'}</h2>
                <div style={{ fontSize: 13, color: '#556', marginTop: 6 }}>Create a reusable message and select who it should be sent to.</div>
              </div>
              <button onClick={() => setShowForm(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>×</button>
            </div>

            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontWeight: 700, fontSize: 13 }}>Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #e1e8ea', fontSize: 14, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontWeight: 700, fontSize: 13 }}>Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={6}
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #e6eef0', fontSize: 14, minHeight: 140, resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: '#667' }}>Tip: keep messages concise for best deliverability.</div>
                    <div style={{ fontSize: 12, color: '#889' }}>{charCount} characters</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 220, flex: '0 0 220px' }}>
                    <label style={{ fontWeight: 700, fontSize: 13 }}>Recipient Type</label>
                    <select value={recipientType} onChange={(e) => setRecipientType(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #e1e8ea' }}>
                      <option value="person">Person</option>
                      <option value="group">Group</option>
                      <option value="state">State</option>
                    </select>
                  </div>

                  <div style={{ flex: 1, minWidth: 220 }}>
                    <label style={{ fontWeight: 700, fontSize: 13 }}>Recipients</label>
                    <div style={{ marginTop: 6 }}>
                      <Select
                        isMulti
                        value={(recipients || []).map(id => {
                          const i = Number(id);
                          let label = `#${i}`;
                          if (recipientType === 'person') {
                            const c = contacts.find(x => x.id === i);
                            if (c) label = `${c.first_name} ${c.last_name} (${c.primary_no})`;
                          } else if (recipientType === 'group') {
                            const g = groups.find(x => x.id === i);
                            if (g) label = g.group_name;
                          } else if (recipientType === 'state') {
                            const s = states.find(x => x.id === i);
                            if (s) label = s.state;
                          }
                          return { value: i, label };
                        })}
                        onChange={(vals) => setRecipients(Array.isArray(vals) ? vals.map(v => v.value) : [])}
                        options={
                          recipientType === 'person'
                            ? contacts.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.primary_no})` }))
                            : recipientType === 'group'
                            ? groups.map(g => ({ value: g.id, label: g.group_name }))
                            : states.map(s => ({ value: s.id, label: s.state }))
                        }
                      />
                      <div style={{ marginTop: 6, fontSize: 12, color: '#667' }}>Pick one or more recipients for this template.</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                  <button type="button" className="btn btn-cancel" onClick={() => setShowForm(false)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #d1d5d8', borderRadius: 6 }}>Cancel</button>
                  <button type="submit" className="btn btn-save" disabled={saving} style={{ padding: '8px 14px', borderRadius: 6, background: '#0b74de', color: '#fff', border: 'none' }}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
