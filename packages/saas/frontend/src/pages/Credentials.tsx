import { useEffect, useState } from "react";

const API = "";

interface Credential {
  id: string;
  site: string;
  email: string;
  createdAt: string;
}

function EditRow({
  cred,
  onSave,
  onCancel,
}: {
  cred: Credential;
  onSave: (id: string, updates: { site: string; email: string; password: string }) => void;
  onCancel: () => void;
}) {
  const [site, setSite] = useState(cred.site);
  const [email, setEmail] = useState(cred.email);
  const [password, setPassword] = useState("");

  const handleSave = () => {
    const updates: Record<string, string> = {};
    if (site !== cred.site) updates.site = site;
    if (email !== cred.email) updates.email = email;
    if (password) updates.password = password;
    if (Object.keys(updates).length === 0) { onCancel(); return; }
    onSave(cred.id, updates as any);
  };

  return (
    <tr>
      <td>
        <input
          type="text"
          value={site}
          onChange={(e) => setSite(e.target.value)}
          className="term-input inline-edit"
        />
      </td>
      <td>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="term-input inline-edit"
        />
      </td>
      <td>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="(unchanged)"
          className="term-input inline-edit"
        />
      </td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleSave} className="row-action-btn save">Save</button>
          <button onClick={onCancel} className="row-action-btn cancel">Cancel</button>
        </div>
      </td>
    </tr>
  );
}

export default function Credentials() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchCredentials = async () => {
    const res = await fetch(`${API}/credentials`);
    setCredentials(await res.json());
  };

  useEffect(() => { fetchCredentials(); }, []);

  const addCredential = async () => {
    if (!site.trim() || !email.trim() || !password.trim()) return;
    await fetch(`${API}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: site.trim(), email: email.trim(), password: password.trim() }),
    });
    setSite("");
    setEmail("");
    setPassword("");
    fetchCredentials();
  };

  const updateCred = async (id: string, updates: { site?: string; email?: string; password?: string }) => {
    await fetch(`${API}/credentials/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setEditingId(null);
    fetchCredentials();
  };

  const deleteCred = async (id: string) => {
    await fetch(`${API}/credentials/${id}`, { method: "DELETE" });
    fetchCredentials();
  };

  return (
    <>
      {/* Store credential form */}
      <div className="term-form">
        <div className="term-form-title">
          Link Vault Node
          <span className="onepass-badge">1Password Connected</span>
        </div>
        <div className="term-form-row" style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="VAULT_NODE_ID"
            className="term-input"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="IDENTITY_STRING"
            className="term-input"
          />
        </div>
        <div className="term-form-row">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCredential()}
            placeholder="SECRET_KEY"
            className="term-input"
          />
          <button onClick={addCredential} className="term-submit">
            Store
          </button>
        </div>
      </div>

      {/* Credentials table */}
      <div className="term-table-container">
        <table>
          <thead>
            <tr>
              <th>Vault Node</th>
              <th>Identity String</th>
              <th>Secret</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((cred) =>
              editingId === cred.id ? (
                <EditRow
                  key={cred.id}
                  cred={cred}
                  onSave={updateCred}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <tr key={cred.id}>
                  <td className="text-cyan">{cred.site.toUpperCase()}</td>
                  <td>{cred.email}</td>
                  <td style={{ color: "var(--sys-cyan-dim)", letterSpacing: "0.15em" }}>
                    {"\u2022".repeat(12)}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => setEditingId(cred.id)}
                        className="row-action-btn edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteCred(cred.id)}
                        className="row-action-btn delete"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {credentials.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-state">
                  NO VAULT NODES LINKED
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
