import { useEffect, useState } from "react";

const API = "";

interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  site: string;
  timestamp: string;
}

export default function Activity() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

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

  return (
    <>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span className="live-dot" />
        <span style={{ fontSize: "0.8rem", color: "var(--sys-cyan-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Live Feed — Refreshing Every 3s
        </span>
      </div>

      <div className="term-table-container">
        <table>
          <thead>
            <tr>
              <th>SYS_TIME</th>
              <th>BADGE_ID</th>
              <th>TARGET_NODE</th>
              <th>PROTOCOL</th>
              <th>RESOLUTION</th>
            </tr>
          </thead>
          <tbody>
            {[...entries].reverse().map((entry) => {
              const denied = entry.action.includes("denied");
              const cls = denied ? "text-red" : "";
              return (
                <tr key={entry.id}>
                  <td className={denied ? "text-red" : ""} style={{ color: denied ? undefined : "var(--sys-cyan-dim)" }}>
                    {formatTime(entry.timestamp)}
                  </td>
                  <td className={cls}>{entry.agentName}</td>
                  <td className={denied ? "text-red" : "text-cyan"}>{entry.site.toUpperCase()}</td>
                  <td className={cls}>AUTH_REQ</td>
                  <td className={cls}>[ {denied ? "DENIED" : "GRANTED"} ]</td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-state">
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
