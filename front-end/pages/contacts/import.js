import { useState } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import API_BASE_URL from "../../utils/apiConfig";

export default function ImportContacts() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a CSV file to import.", {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("csv_file", file); // <-- Use 'csv_file' as the field name

    const res = await fetch(`${API_BASE_URL}/api/v1/contacts/import`, {
      method: "POST",
      body: formData,
    });

    setUploading(false);

    if (res.ok) {
      toast.success("Contacts imported successfully!", {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
      setFile(null);
    } else {
      toast.error("Failed to import contacts.", {
        position: "top-right",
        autoClose: 2000,
        theme: "colored",
      });
    }
  };

  return (
    <div style={{ position: 'relative', maxWidth: 500, margin: "40px auto", background: "#fff", padding: 32, borderRadius: 12, boxShadow: "0 2px 16px #e0e0e0" }}>
      {/* Spinner overlay while uploading */}
      {uploading && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.7)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 56,
              height: 56,
              border: '6px solid #e0e0e0',
              borderTop: '6px solid #46aa42',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: 16,
            }} />
            <span style={{ color: '#46aa42', fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>Importing...</span>
          </div>
          {/* Spinner keyframes */}
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
      <h1
        style={{
          marginBottom: 24,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 32, marginRight: 10 }}>⬆️</span>
        Import Contacts
      </h1>
      <form onSubmit={handleSubmit}>
        <div
          style={{
            border: "2px dashed #46aa42",
            borderRadius: 8,
            padding: 32,
            textAlign: "center",
            marginBottom: 24,
            background: "#f9f9f9",
          }}
        >
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: "none" }}
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              background: "#46aa42",
              color: "#fff",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {file ? "Change File" : "Choose CSV File"}
          </label>
          <div style={{ marginTop: 12, color: "#888" }}>
            {file ? file.name : "No file selected"}
          </div>
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="btn btn-force-padding"
          style={{
            width: "100%",
            padding: 14,
            background: "#46aa42",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontWeight: 600,
            fontSize: 16,
            cursor: uploading ? "not-allowed" : "pointer",
            marginBottom: 8,
          }}
        >
          {uploading ? "Importing..." : "Import Contacts"}
        </button>
      </form>
      <div
        style={{
          marginTop: 24,
          fontSize: 14,
          color: "#555",
          background: "#f4f8f4",
          padding: 16,
          borderRadius: 6,
        }}
      >
        <strong>Instructions:</strong>
        <ul style={{ margin: "8px 0 0 18px" }}>
          <li>Upload a CSV file with your contacts.</li>
          <li>
            Required columns:{" "}
            <b>
              first_name, last_name, address_state, primary_no, email_add,
              group_no, is_subscribed
            </b>
          </li>
          <li>Maximum file size: 2MB.</li>
        </ul>
      </div>
    </div>
  );
}