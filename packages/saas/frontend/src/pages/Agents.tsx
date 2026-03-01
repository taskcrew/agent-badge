import { useEffect, useState, useRef, type MouseEvent } from "react";

const API = "";

interface RecentActivityEntry {
  id: string;
  agentName: string;
  action: string;
  site: string;
  detail: string;
  timestamp: string;
}

interface Agent {
  id: string;
  name: string;
  apiKey: string;
  description: string;
  expiresAt: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  recentActivity: RecentActivityEntry[];
  deniedCount: number;
  linkedCredentials: string[];
  linkedOAuthConnections: string[];
  mailboxAddress: string | null;
}

function computeStatus(lastActivityAt: string | null, expiresAt: string | null): { label: string; color: string; ledClass: string } {
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return { label: "EXPIRED", color: "var(--alert-red)", ledClass: "dormant" };
  }
  if (!lastActivityAt) return { label: "DORMANT", color: "#888", ledClass: "dormant" };
  const diffMs = Date.now() - new Date(lastActivityAt).getTime();
  if (diffMs < 60 * 60 * 1000) return { label: "ACTIVE", color: "#00c853", ledClass: "active" };
  if (diffMs < 24 * 60 * 60 * 1000) return { label: "IDLE", color: "#ffd600", ledClass: "idle" };
  return { label: "DORMANT", color: "#888", ledClass: "dormant" };
}

interface Credential {
  id: string;
  site: string;
  email: string;
}

interface OAuthConnection {
  id: string;
  provider: string;
  label: string;
  googleEmail: string;
}

const BARCODE_WIDTHS = [2,1,3,1,2,1,1,3,2,1,2,1,3,1,1,2,3,1,2,1,1,3,1,2,1,1,2,3,1,2];

function Barcode({ seed }: { seed: string }) {
  const hex = "0x" + Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0).toString(16), "").slice(0, 6).toUpperCase();

  return (
    <>
      <div className="badge-barcode">
        {BARCODE_WIDTHS.map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 0 }}>
            <div style={{ width: w, height: "100%", background: "var(--ink-dark)" }} />
            <div style={{ width: Math.max(1, w - 1), height: "100%" }} />
          </div>
        ))}
      </div>
      <div className="barcode-label">{hex} // AgentBadge</div>
    </>
  );
}

function maskKey(key: string): string {
  return "AK_\u2022\u2022\u2022\u2022" + key.slice(-4).toUpperCase();
}

function CopyKeyButton({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="copy-key-btn"
      title="Copy full API key"
    >
      {copied ? "COPIED" : "COPY KEY"}
    </button>
  );
}

function VaultLinker({
  agent,
  credentials,
  onLink,
  onUnlink,
}: {
  agent: Agent;
  credentials: Credential[];
  onLink: (agentId: string, credentialId: string) => void;
  onUnlink: (agentId: string, credentialId: string) => void;
}) {
  const linked = credentials.filter((c) => agent.linkedCredentials.includes(c.id));
  const unlinked = credentials.filter((c) => !agent.linkedCredentials.includes(c.id));

  return (
    <div className="vault-linker" onClick={(e) => e.stopPropagation()}>
      <div className="vault-linker-label">Vault Access</div>
      {linked.length > 0 && (
        <div className="vault-chips">
          {linked.map((cred) => (
            <span key={cred.id} className="vault-chip linked">
              {cred.site.toUpperCase()}
              <button
                className="vault-chip-remove"
                onClick={(e) => { e.stopPropagation(); onUnlink(agent.id, cred.id); }}
                title="Revoke access"
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
      {unlinked.length > 0 && (
        <div className="vault-chips">
          {unlinked.map((cred) => (
            <span
              key={cred.id}
              className="vault-chip available"
              onClick={(e) => { e.stopPropagation(); onLink(agent.id, cred.id); }}
              title="Grant access"
            >
              + {cred.site.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      {credentials.length === 0 && (
        <div style={{ fontSize: "0.65rem", color: "var(--ink-muted)" }}>No vault nodes created yet</div>
      )}
    </div>
  );
}

function OAuthLinker({
  agent,
  oauthConnections,
  onLink,
  onUnlink,
}: {
  agent: Agent;
  oauthConnections: OAuthConnection[];
  onLink: (agentId: string, oauthConnectionId: string) => void;
  onUnlink: (agentId: string, oauthConnectionId: string) => void;
}) {
  const linked = oauthConnections.filter((c) => agent.linkedOAuthConnections.includes(c.id));
  const unlinked = oauthConnections.filter((c) => !agent.linkedOAuthConnections.includes(c.id));

  return (
    <div className="vault-linker" onClick={(e) => e.stopPropagation()}>
      <div className="vault-linker-label">OAuth Access</div>
      {linked.length > 0 && (
        <div className="vault-chips">
          {linked.map((conn) => (
            <span key={conn.id} className="vault-chip linked">
              {conn.label.toUpperCase()}
              <button
                className="vault-chip-remove"
                onClick={(e) => { e.stopPropagation(); onUnlink(agent.id, conn.id); }}
                title="Revoke OAuth access"
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
      {unlinked.length > 0 && (
        <div className="vault-chips">
          {unlinked.map((conn) => (
            <span
              key={conn.id}
              className="vault-chip available"
              onClick={(e) => { e.stopPropagation(); onLink(agent.id, conn.id); }}
              title="Grant OAuth access"
            >
              + {conn.label.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      {oauthConnections.length === 0 && (
        <div style={{ fontSize: "0.65rem", color: "var(--ink-muted)" }}>No OAuth connections created yet</div>
      )}
    </div>
  );
}

function MailboxSection({
  agent,
  onCreate,
  onDelete,
}: {
  agent: Agent;
  onCreate: (agentId: string) => void;
  onDelete: (agentId: string) => void;
}) {
  return (
    <div className="vault-linker" onClick={(e) => e.stopPropagation()}>
      <div className="vault-linker-label">OTP Mailbox</div>
      {agent.mailboxAddress ? (
        <div className="vault-chips">
          <span className="vault-chip linked" style={{ fontSize: "0.6rem" }}>
            {agent.mailboxAddress}
            <button
              className="vault-chip-remove"
              onClick={(e) => { e.stopPropagation(); onDelete(agent.id); }}
              title="Remove mailbox"
            >
              x
            </button>
          </span>
        </div>
      ) : (
        <div className="vault-chips">
          <span
            className="vault-chip available"
            onClick={(e) => { e.stopPropagation(); onCreate(agent.id); }}
            title="Create OTP mailbox for this agent"
          >
            + CREATE MAILBOX
          </span>
        </div>
      )}
    </div>
  );
}

function RecentActivityFeed({ activity }: { activity: RecentActivityEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  if (activity.length === 0) return null;

  return (
    <div className="vault-linker" onClick={(e) => e.stopPropagation()}>
      <div
        className="vault-linker-label"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "\u25BE" : "\u25B8"} Recent Activity ({activity.length})
      </div>
      {expanded && (
        <div style={{ fontSize: "0.6rem", fontFamily: "'IBM Plex Mono', monospace" }}>
          {activity.map((a) => {
            const denied = a.action.includes("denied") || a.action.includes("failed");
            return (
              <div key={a.id} style={{
                padding: "2px 0",
                color: denied ? "var(--alert-red)" : "var(--ink-muted)",
              }}>
                {new Date(a.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                {" "}{a.action.replace(/_/g, " ").toUpperCase()}
                {" \u2192 "}{a.site.toUpperCase()}
                {a.detail === "first_access" && (
                  <span style={{
                    marginLeft: 4,
                    fontSize: "0.5rem",
                    padding: "0 3px",
                    background: "#ffd600",
                    color: "#000",
                    borderRadius: 2,
                    fontWeight: 700,
                  }}>1ST</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [oauthConnections, setOAuthConnections] = useState<OAuthConnection[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchAgents = async () => {
    const res = await fetch(`${API}/agents`);
    setAgents(await res.json());
  };

  const fetchCredentials = async () => {
    const res = await fetch(`${API}/credentials`);
    setCredentials(await res.json());
  };

  const fetchOAuthConnections = async () => {
    const res = await fetch(`${API}/oauth/connections`);
    setOAuthConnections(await res.json());
  };

  useEffect(() => { fetchAgents(); fetchCredentials(); fetchOAuthConnections(); }, []);

  const createAgent = async () => {
    if (!name.trim()) return;
    await fetch(`${API}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() }),
    });
    setName("");
    setDescription("");
    fetchAgents();
  };

  const updateAgent = async (id: string) => {
    if (!editName.trim()) return;
    await fetch(`${API}/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null);
    setEditName("");
    fetchAgents();
  };

  const deleteAgent = async (id: string) => {
    if (!confirm("Delete this agent? All linked credentials, OAuth connections, and mailbox will be unlinked.")) return;
    await fetch(`${API}/agents/${id}`, { method: "DELETE" });
    fetchAgents();
  };

  const rotateKey = async (id: string) => {
    if (!confirm("Rotate API key? The current key will stop working immediately.")) return;
    const res = await fetch(`${API}/agents/${id}/rotate-key`, { method: "PATCH" });
    if (res.ok) {
      const updated = await res.json();
      alert(`New API key:\n${updated.apiKey}\n\nCopy this now — it won't be shown again.`);
      fetchAgents();
    }
  };

  const linkCredential = async (agentId: string, credentialId: string) => {
    await fetch(`${API}/agents/${agentId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId }),
    });
    fetchAgents();
  };

  const unlinkCredential = async (agentId: string, credentialId: string) => {
    await fetch(`${API}/agents/${agentId}/links/${credentialId}`, {
      method: "DELETE",
    });
    fetchAgents();
  };

  const linkOAuth = async (agentId: string, oauthConnectionId: string) => {
    await fetch(`${API}/agents/${agentId}/oauth-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oauthConnectionId }),
    });
    fetchAgents();
  };

  const unlinkOAuth = async (agentId: string, oauthConnectionId: string) => {
    await fetch(`${API}/agents/${agentId}/oauth-links/${oauthConnectionId}`, {
      method: "DELETE",
    });
    fetchAgents();
  };

  const createMailbox = async (agentId: string) => {
    await fetch(`${API}/agents/${agentId}/mailbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    fetchAgents();
  };

  const deleteMailbox = async (agentId: string) => {
    await fetch(`${API}/agents/${agentId}/mailbox`, {
      method: "DELETE",
    });
    fetchAgents();
  };

  const createRipple = (e: MouseEvent<HTMLDivElement>, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ripple = document.createElement("div");
    ripple.className = "nfc-ripple";
    ripple.style.left = (x - 10) + "px";
    ripple.style.top = (y - 10) + "px";
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  };

  return (
    <>
      {/* Create agent form */}
      <div className="term-form">
        <div className="term-form-title">Register New Agent</div>
        <div className="term-form-row">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createAgent()}
            placeholder="AGENT_IDENTIFIER"
            className="term-input"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createAgent()}
            placeholder="DESCRIPTION (optional)"
            className="term-input"
          />
          <button onClick={createAgent} className="term-submit">
            Issue Badge
          </button>
        </div>
      </div>

      {/* Badge grid */}
      <div className="badge-grid">
        {agents.map((agent, idx) => (
          <div
            key={agent.id}
            className="badge-card"
            onClick={(e) => createRipple(e, e.currentTarget)}
          >
            <div className="badge-watermark">BADGE</div>
            <div className="punch-hole" />
            <div className="mag-stripe">
              <div className="mag-scan-line" />
            </div>

            <div className="badge-body">
              <div className="badge-header">
                <div>
                  <div className="agent-label-small">Agent Identifier</div>
                  {editingId === agent.id ? (
                    <div className="inline-edit" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateAgent(agent.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="term-input"
                        style={{ fontSize: "0.75rem", padding: "2px 4px", width: "120px" }}
                        autoFocus
                      />
                      <button className="row-action-btn" onClick={() => updateAgent(agent.id)} style={{ fontSize: "0.6rem" }}>Save</button>
                      <button className="row-action-btn" onClick={() => setEditingId(null)} style={{ fontSize: "0.6rem" }}>Cancel</button>
                    </div>
                  ) : (
                    <div className="agent-name">{agent.name}</div>
                  )}
                  {agent.description && (
                    <div style={{ fontSize: "0.6rem", color: "var(--ink-muted)", fontStyle: "italic", marginTop: 2 }}>
                      {agent.description}
                    </div>
                  )}
                </div>
                <div className="agent-number">{String(idx + 1).padStart(2, "0")}</div>
              </div>

              <div className="badge-id-row">
                <div className="badge-photo">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
                  </svg>
                </div>
                <div className="badge-data">
                  <div className="data-row">
                    <span className="data-label">Clearance</span>
                    <span className="data-val">
                      {agent.linkedCredentials.length > 0
                        ? `${agent.linkedCredentials.length} VAULT${agent.linkedCredentials.length > 1 ? "S" : ""}`
                        : "NONE"}
                    </span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Key Sig</span>
                    <span className="data-val api-key-mask">{maskKey(agent.apiKey)}</span>
                  </div>
                  {agent.expiresAt && (
                    <div className="data-row">
                      <span className="data-label">Expires</span>
                      <span className="data-val" style={{
                        color: new Date(agent.expiresAt) < new Date() ? "var(--alert-red)"
                          : new Date(agent.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 ? "#ffd600"
                          : "var(--sys-cyan-dim)",
                      }}>
                        {new Date(agent.expiresAt) < new Date() ? "EXPIRED " : ""}
                        {new Date(agent.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {agent.deniedCount > 0 && (
                    <div className="data-row">
                      <span className="data-label">Denied</span>
                      <span className="data-val" style={{ color: "var(--alert-red)" }}>
                        {agent.deniedCount} REQ{agent.deniedCount > 1 ? "S" : ""}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const status = computeStatus(agent.lastActivityAt, agent.expiresAt);
                    return (
                      <div className="data-row status-row">
                        <span className="data-label">Status</span>
                        <span className="data-val" style={{ color: status.color }}>
                          <span className={`status-led ${status.ledClass}`} />{status.label}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <CopyKeyButton apiKey={agent.apiKey} />

              <div className="badge-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="row-action-btn"
                  onClick={() => { setEditingId(agent.id); setEditName(agent.name); }}
                >
                  Rename
                </button>
                <button
                  className="row-action-btn"
                  onClick={() => rotateKey(agent.id)}
                >
                  Rotate Key
                </button>
                <button
                  className="row-action-btn delete"
                  onClick={() => deleteAgent(agent.id)}
                >
                  Delete
                </button>
              </div>

              <VaultLinker
                agent={agent}
                credentials={credentials}
                onLink={linkCredential}
                onUnlink={unlinkCredential}
              />

              <OAuthLinker
                agent={agent}
                oauthConnections={oauthConnections}
                onLink={linkOAuth}
                onUnlink={unlinkOAuth}
              />

              <MailboxSection
                agent={agent}
                onCreate={createMailbox}
                onDelete={deleteMailbox}
              />

              <RecentActivityFeed activity={agent.recentActivity} />
            </div>

            <Barcode seed={agent.id} />

            <div className="badge-footer">
              <span className="badge-footer-text">AGENT BADGE // AgentBadge v2.1</span>
              <span className="badge-footer-text">
                {new Date(agent.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="empty-state">NO BADGES ISSUED // USE FORM ABOVE TO REGISTER AN AGENT</div>
      )}
    </>
  );
}
