import { useEffect, useState } from "react";

const API = "";

const ENDPOINTS = [
  { label: "Authorization", url: "/oauth/authorize" },
  { label: "Token", url: "/oauth/token" },
  { label: "UserInfo", url: "/oauth/userinfo" },
];

interface OAuthConnection {
  id: string;
  provider: string;
  label: string;
  googleEmail: string;
  scopes: string;
  revoked: boolean;
  createdAt: string;
}

export default function OAuth() {
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const fetchConnections = async () => {
    const res = await fetch(`${API}/oauth/connections`);
    setConnections(await res.json());
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const updateConnection = async (id: string) => {
    if (!editLabel.trim()) return;
    await fetch(`${API}/oauth/connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel.trim() }),
    });
    setEditingId(null);
    setEditLabel("");
    fetchConnections();
  };

  const revokeConnection = async (id: string) => {
    await fetch(`${API}/oauth/connections/${id}/revoke`, { method: "POST" });
    fetchConnections();
  };

  const deleteConnection = async (id: string) => {
    await fetch(`${API}/oauth/connections/${id}`, { method: "DELETE" });
    fetchConnections();
  };

  return (
    <>
      <div className="term-form">
        <div className="term-form-title">Agent Badge OAuth</div>
        <div style={{ padding: "8px 12px", fontSize: "0.85rem", opacity: 0.7 }}>
          Let agents authenticate on any site with "Sign in with Agent Badge"
        </div>
        <div style={{ padding: "4px 12px 12px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              fontSize: "0.7rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              border: "1px solid var(--accent, #0ff)",
              color: "var(--accent, #0ff)",
              borderRadius: "2px",
            }}
          >
            IN DEVELOPMENT
          </span>
        </div>
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {ENDPOINTS.map((ep) => {
            const fullUrl = `${baseUrl}${ep.url}`;
            return (
              <div key={ep.label} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem" }}>
                <span style={{ width: "100px", opacity: 0.6 }}>{ep.label}</span>
                <code style={{ flex: 1, fontSize: "0.75rem", opacity: 0.8 }}>{fullUrl}</code>
                <button
                  className="row-action-btn"
                  onClick={() => copyToClipboard(fullUrl, ep.label)}
                  style={{ fontSize: "0.7rem" }}
                >
                  {copied === ep.label ? "Copied" : "Copy"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ margin: "16px 0 8px", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.05em" }}>
        CONNECTED IDENTITY SOURCES
      </div>

      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Label</th>
            <th>Email</th>
            <th>Scopes</th>
            <th>Connected</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {connections.map((conn) => (
            <tr key={conn.id} style={conn.revoked ? { opacity: 0.5 } : undefined}>
              <td>{conn.provider.toUpperCase()}</td>
              <td>
                {editingId === conn.id ? (
                  <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") updateConnection(conn.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="term-input"
                      style={{ fontSize: "0.75rem", padding: "2px 4px", width: "120px" }}
                      autoFocus
                    />
                    <button className="row-action-btn" onClick={() => updateConnection(conn.id)}>Save</button>
                    <button className="row-action-btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </span>
                ) : (
                  conn.label
                )}
              </td>
              <td>{conn.googleEmail}</td>
              <td style={{ fontSize: "0.7rem" }}>{conn.scopes}</td>
              <td>
                {conn.revoked
                  ? <span style={{ color: "var(--danger, #e55)" }}>REVOKED</span>
                  : new Date(conn.createdAt).toLocaleDateString()}
              </td>
              <td>
                {conn.revoked ? (
                  <button
                    className="row-action-btn delete"
                    onClick={() => deleteConnection(conn.id)}
                  >
                    Delete
                  </button>
                ) : (
                  <>
                    <button
                      className="row-action-btn"
                      onClick={() => { setEditingId(conn.id); setEditLabel(conn.label); }}
                    >
                      Edit
                    </button>
                    <button
                      className="row-action-btn delete"
                      onClick={() => revokeConnection(conn.id)}
                    >
                      Revoke
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {connections.length === 0 && (
        <div className="empty-state">
          NO IDENTITY SOURCES CONNECTED // GOOGLE CONNECT COMING SOON
        </div>
      )}
    </>
  );
}
