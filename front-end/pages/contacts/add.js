import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import API_BASE_URL from '../../utils/apiConfig';

export default function AddContact() {
  const [groups, setGroups] = useState([]);
  const [addressStates, setAddressStates] = useState([]);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    address_state: "",
    primary_no: "",
    email_add: "",
    group_no: "",
    is_subscribed: "1",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/groups`)
      .then(res => res.json())
      .then(data => setGroups(data));
    fetch(`${API_BASE_URL}/v1/address-states`)
      .then(res => res.json())
      .then(data => setAddressStates(data));
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`${API_BASE_URL}/api/v1/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      setForm({
        first_name: "",
        last_name: "",
        address_state: "",
        primary_no: "",
        email_add: "",
        group_no: "",
        is_subscribed: "1",
      });
      toast.success("Contact added successfully!", {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
    } else {
      toast.error("Failed to add contact.", {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "40px auto", background: "#fff", padding: 32, borderRadius: 8, boxShadow: "0 2px 8px #f0f1f2" }}>
      <h1 style={{ marginBottom: 24 }}>Add Contact</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label>First Name</label>
          <input
            name="first_name"
            value={form.first_name}
            onChange={handleChange}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Last Name</label>
          <input
            name="last_name"
            value={form.last_name}
            onChange={handleChange}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Primary No</label>
          <input
            name="primary_no"
            value={form.primary_no}
            onChange={handleChange}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Email Address</label>
          <input
            name="email_add"
            value={form.email_add}
            onChange={handleChange}
            required
            type="email"
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Group</label>
          <select
            name="group_no"
            value={form.group_no}
            onChange={handleChange}
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
            value={form.address_state}
            onChange={handleChange}
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
            value={form.is_subscribed}
            onChange={handleChange}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          >
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            background: "#46aa42",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontWeight: 600,
            fontSize: 16,
            cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "Adding..." : "Add Contact"}
        </button>
      </form>
    </div>
  );
}