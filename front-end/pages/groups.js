import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import API_BASE_URL from '../utils/apiConfig';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [groupCounts, setGroupCounts] = useState({});

  const fetchGroups = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/v1/groups`)
      .then((res) => res.json())
      .then((data) => {
        setGroups(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGroups();
    fetch(`${API_BASE_URL}/api/v1/contacts/count-by-group`)
      .then(res => res.json())
      .then(data => {
        const counts = {};
        if (Array.isArray(data)) {
          data.forEach(item => {
            counts[item.group_no] = item.total;
          });
        }
        setGroupCounts(counts);
      });
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroup.trim()) {
      toast.error("Group name cannot be empty.", { theme: "colored" });
      return;
    }
    setCreating(true);
    const res = await fetch(`${API_BASE_URL}/api/v1/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_name: newGroup }),
    });
    setCreating(false);
    if (res.ok) {
      setShowModal(false);
      setNewGroup("");
      toast.success("Group has been created!", { theme: "colored" });
      fetchGroups();
    } else {
      toast.error("Failed to create group.", { theme: "colored" });
    }
  };

  const handleEdit = (group) => {
    setEditId(group.id);
    setEditName(group.group_name);
  };

  const handleEditSave = async (id) => {
    if (!editName.trim()) {
      toast.error("Group name cannot be empty.", { theme: "colored" });
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/v1/groups/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_name: editName }),
    });
    if (res.ok) {
      toast.success("Group updated successfully!", { theme: "colored" });
      setEditId(null);
      setEditName("");
      fetchGroups();
    } else {
      toast.error("Failed to update group.", { theme: "colored" });
    }
  };

  const handleEditCancel = () => {
    setEditId(null);
    setEditName("");
  };

  const handleDelete = (id) => {
    setDeletingId(id);
  };

  const confirmDelete = async () => {
    const id = deletingId;
    setDeletingId(null);
    const res = await fetch(`${API_BASE_URL}/api/v1/groups/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Group deleted successfully!", { theme: "colored" });
      fetchGroups();
    } else {
      toast.error("Failed to delete group.", { theme: "colored" });
    }
  };

  return (
    <div>
      
      <div style={{ display: "flex", alignItems: "center", margin: "32px 0 24px 0" }}>
        <span style={{ fontSize: 36, marginRight: 12 }}>🗂️</span>
        <h1 style={{ fontWeight: 700, fontSize: 32, margin: 0, marginRight: 24 }}>Manage Groups</h1>
        <button
          className="btn btn-create btn-fixed-radius"
          onClick={() => setShowModal(true)}
          style={{
            background: "#46aa42",
            color: "#fff",
            border: "none",
            padding: "8px 20px",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 16,
            cursor: "pointer",
            marginLeft: "auto"
          }}
        >
          Add New Group
        </button>
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: 3,
          boxShadow: "0 2px 8px #f0f1f2",
          overflowX: "auto",
          maxWidth: 900,
        }}
      >
        <table className="compact-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 600,
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>ID</th>
              <th style={{ textAlign: "left" }}>Group Name</th>
              <th style={{ textAlign: "left" }}>Number of Contacts</th>
              <th style={{ textAlign: "left" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: 24 }}>
                  Loading...
                </td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: 24 }}>
                  No groups found.
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 12 }}>{group.id}</td>
                  <td style={{ padding: 12 }}>
                    {editId === group.id ? (
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        style={{
                          padding: 6,
                          borderRadius: 4,
                          border: "1px solid #ccc",
                          fontSize: 15,
                          width: "90%",
                        }}
                        autoFocus
                      />
                    ) : (
                      group.group_name
                    )}
                  </td>
                  <td style={{ padding: 12 }}>
                    {groupCounts[group.id] || 0}
                  </td>
                  <td style={{ padding: 12 }}>
                    {editId === group.id ? (
                      <>
                        <button
                          className="btn btn-save no-icon"
                          onClick={() => handleEditSave(group.id)}
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
                          }}
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-cancel no-icon"
                          onClick={handleEditCancel}
                          style={{
                            color: "#fff",
                            background: "#888",
                            border: "none",
                            padding: "4px 12px",
                            borderRadius: 4,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                           Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn no-icon btn-fixed-radius"
                          onClick={() => handleEdit(group)}
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
                          }}
                        >
                          {/* Pencil icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: 'middle' }}>
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Edit
                        </button>
                        <button
                          className="btn no-icon btn-fixed-radius"
                          onClick={() => handleDelete(group.id)}
                          style={{
                            color: "#fff",
                            background: "#d32f2f",
                            border: "none",
                            padding: "4px 12px",
                            borderRadius: 4,
                            opacity: groupCounts[group.id] > 0 ? 0.5 : 1,
                            cursor: groupCounts[group.id] > 0 ? "not-allowed" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                          disabled={groupCounts[group.id] > 0}
                        >
                          {/* Simple white filled circle (no inner icon) */}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
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
      </div>

      {/* Modal for Add New Group */}
      {showModal && (
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
            minWidth: 340,
            boxShadow: "0 4px 24px #e0e0e0",
            position: "relative"
          }}>
            <h2 style={{ marginTop: 0, marginBottom: 18, color: "#46aa42" }}>Add New Group</h2>
            <form onSubmit={handleCreateGroup}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
                  Enter Group Name
                </label>
                <input
                  name="group_name"
                  value={newGroup}
                  onChange={e => setNewGroup(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 5,
                    border: "1px solid #ccc",
                    fontSize: 16
                  }}
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  className="btn btn-cancel"
                  type="button"
                  onClick={() => { setShowModal(false); setNewGroup(""); }}
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
                  disabled={creating}
                >
                  Close
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
                    cursor: creating ? "not-allowed" : "pointer"
                  }}
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
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
            minWidth: 340,
            boxShadow: "0 4px 24px #e0e0e0",
            position: "relative"
          }}>
            <h2 style={{ marginTop: 0, marginBottom: 18, color: "#d32f2f" }}>Delete Group</h2>
            <p>Are you sure you want to delete this group? This action cannot be undone.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button
                className="btn btn-cancel"
                type="button"
                onClick={() => setDeletingId(null)}
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
              >
                Cancel
              </button>
              <button
                className="btn btn-delete"
                type="button"
                onClick={confirmDelete}
                style={{
                  background: "#d32f2f",
                  color: "#fff",
                  border: "none",
                  padding: "8px 18px",
                  borderRadius: 5,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer"
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}