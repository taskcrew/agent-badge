import { useEffect, useState } from "react";

const API = "";

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
        <div className="term-form-title">Connect OAuth Provider</div>
        <div className="term-form-row">
          <a
            href={`${API}/oauth/google/authorize`}
            className="term-submit"
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            Connect Google Account
          </a>
        </div>
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
          NO OAUTH CONNECTIONS // USE BUTTON ABOVE TO CONNECT A GOOGLE ACCOUNT
        </div>
      )}
    </>
  );
}
