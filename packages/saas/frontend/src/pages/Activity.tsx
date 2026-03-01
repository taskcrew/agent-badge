import React, { useEffect, useState } from "react";

const API = "";

interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  site: string;
  credentialId: string;
  detail: string;
  timestamp: string;
}

const ACTION_LABELS: Record<string, { protocol: string; label: string }> = {
  credential_access: { protocol: "CRED_REQ", label: "GRANTED" },
  credential_access_denied: { protocol: "CRED_REQ", label: "DENIED" },
  oauth_token_issued: { protocol: "OAUTH", label: "TOKEN ISSUED" },
  oauth_token_denied: { protocol: "OAUTH", label: "DENIED" },
  oauth_signin_click: { protocol: "OAUTH", label: "SIGNIN CLICK" },
  oauth_signin_success: { protocol: "OAUTH", label: "SIGNIN OK" },
  oauth_signin_failed: { protocol: "OAUTH", label: "SIGNIN FAIL" },
  otp_fetched: { protocol: "OTP", label: "CODE FETCHED" },
  otp_fetch_failed: { protocol: "OTP", label: "FETCH FAIL" },
};

function getActionInfo(action: string) {
  const info = ACTION_LABELS[action];
  if (info) return info;
  const denied = action.includes("denied") || action.includes("failed");
  return { protocol: action.toUpperCase().replace(/_/g, " "), label: denied ? "DENIED" : "GRANTED" };
}

function isDenied(action: string) {
  return action.includes("denied") || action.includes("failed");
}

function formatEntryText(entry: ActivityEntry, info: { protocol: string; label: string }, denied: boolean) {
  const lines = [
    `EVENT_ID:      ${entry.id}`,
    `TIMESTAMP:     ${new Date(entry.timestamp).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")}`,
    `AGENT_ID:      ${entry.agentId}`,
    `AGENT_NAME:    ${entry.agentName}`,
    `ACTION:        ${entry.action}`,
    `PROTOCOL:      ${info.protocol}`,
    `TARGET_SITE:   ${entry.site}`,
    `STATUS:        ${denied ? "FAILED / DENIED" : "SUCCESS"} (${info.label})`,
  ];
  if (entry.credentialId) lines.push(`CREDENTIAL_ID: ${entry.credentialId}`);
  if (entry.detail) lines.push(`DETAIL:        ${entry.detail}`);
  return lines.join("\n");
}

export default function Activity() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchActivity = async () => {
    const res = await fetch(`${API}/activity`);
    setEntries(await res.json());
  };

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false });
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  const formatFull = (ts: string) => {
    const d = new Date(ts);
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  };

  const sorted = [...entries].reverse();

  return (
    <>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="live-dot" />
          <span style={{ fontSize: "0.8rem", color: "var(--sys-cyan-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Live Feed — Refreshing Every 3s
          </span>
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--sys-cyan-dim)" }}>
          {entries.length} EVENT{entries.length !== 1 ? "S" : ""}
        </span>
      </div>

      <div className="term-table-container">
        <table className="audit-table">
          <thead>
            <tr>
              <th></th>
              <th>SYS_TIME</th>
              <th>BADGE_ID</th>
              <th>TARGET_NODE</th>
              <th>PROTOCOL</th>
              <th>RESOLUTION</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => {
              const denied = isDenied(entry.action);
              const cls = denied ? "text-red" : "";
              const info = getActionInfo(entry.action);
              const expanded = expandedId === entry.id;

              const handleRowClick = (e: React.MouseEvent) => {
                const selection = window.getSelection();
                if (selection && selection.toString().length > 0) return;
                if ((e.target as HTMLElement).closest(".audit-detail")) return;
                setExpandedId(expanded ? null : entry.id);
              };

              return (
                <React.Fragment key={entry.id}>
                  <tr
                    onMouseUp={handleRowClick}
                    style={{ cursor: "pointer" }}
                    className={expanded ? "audit-row-expanded" : ""}
                  >
                    <td style={{ color: "var(--sys-cyan-dim)", fontSize: "0.75rem", textAlign: "center" }}>
                      {expanded ? "\u25BE" : "\u25B8"}
                    </td>
                    <td style={{ color: denied ? "var(--alert-red)" : "var(--sys-cyan-dim)", whiteSpace: "nowrap" }}>
                      {formatTime(entry.timestamp)}
                    </td>
                    <td className={cls}>
                      {entry.agentName}
                    </td>
                    <td className={denied ? "text-red" : "text-cyan"}>
                      {entry.site.toUpperCase()}
                      {entry.detail === "first_access" && (
                        <span style={{
                          marginLeft: 6,
                          fontSize: "0.55rem",
                          padding: "1px 4px",
                          background: "#ffd600",
                          color: "#000",
                          borderRadius: 2,
                          fontWeight: 700,
                          verticalAlign: "middle",
                        }}>1ST</span>
                      )}
                    </td>
                    <td className={cls}>
                      {info.protocol}
                    </td>
                    <td className={cls} style={{ whiteSpace: "nowrap" }}>
                      [ {info.label} ]
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="audit-row-expanded">
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div className="audit-detail" onClick={(e) => e.stopPropagation()}>
                          <div className="audit-detail-grid">
                            <div className="audit-detail-item">
                              <span className="audit-detail-label">EVENT_ID</span>
                              <span className="audit-detail-value">{entry.id}</span>
                            </div>
                            <div className="audit-detail-item">
                              <span className="audit-detail-label">TIMESTAMP</span>
                              <span className="audit-detail-value">{formatFull(entry.timestamp)}</span>
                            </div>
                            <div className="audit-detail-item">
                              <span className="audit-detail-label">DATE</span>
                              <span className="audit-detail-value">{formatDate(entry.timestamp)}</span>
                            </div>
                            <div className="audit-detail-item">
                              <span className="audit-detail-label">AGENT_ID</span>
                              <span className="audit-detail-value">{entry.agentId}</span>
                            </div>
                            <div className="audit-detail-item">
                              <span className="audit-detail-label">AGENT_NAME</span>
                              <span className="audit-detail-value">{entry.agentName}</span>
                            </div>
                            <div className="audit-detail-item">
                              <span className="audit-detail-label">ACTION</span>
                              <span className="audit-detail-value">{entry.action}</span>
                            </div>
                            <div className="audit-detail-item">
                              <span className="audit-detail-label">TARGET_SITE</span>
                              <span className="audit-detail-value">{entry.site}</span>
                            </div>
                            <div className="audit-detail-item">
                              <span className="audit-detail-label">STATUS</span>
                              <span className={`audit-detail-value ${denied ? "text-red" : ""}`} style={{ color: denied ? undefined : "#00c853" }}>
                                {denied ? "FAILED / DENIED" : "SUCCESS"}
                              </span>
                            </div>
                            {entry.credentialId && (
                              <div className="audit-detail-item">
                                <span className="audit-detail-label">CREDENTIAL_ID</span>
                                <span className="audit-detail-value">{entry.credentialId}</span>
                              </div>
                            )}
                            {entry.detail && (
                              <div className="audit-detail-item">
                                <span className="audit-detail-label">DETAIL</span>
                                <span className={`audit-detail-value ${entry.detail === "first_access" ? "" : denied ? "text-red" : ""}`}
                                  style={entry.detail === "first_access" ? { color: "#ffd600" } : undefined}
                                >
                                  {entry.detail === "first_access" ? "FIRST ACCESS" : entry.detail.toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            className="row-action-btn"
                            style={{ marginTop: 14 }}
                            onClick={() => {
                              navigator.clipboard.writeText(formatEntryText(entry, info, denied));
                              setCopiedId(entry.id);
                              setTimeout(() => setCopiedId((prev) => prev === entry.id ? null : prev), 1500);
                            }}
                          >
                            {copiedId === entry.id ? "COPIED" : "COPY LOG"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  NO AUDIT EVENTS RECORDED
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
