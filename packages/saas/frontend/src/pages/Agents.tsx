import { useEffect, useState, useRef, type MouseEvent } from "react";

const API = "";

interface Agent {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
}

const BARCODE_WIDTHS = [2,1,3,1,2,1,1,3,2,1,2,1,3,1,1,2,3,1,2,1,1,3,1,2,1,1,2,3,1,2];

function Barcode({ seed }: { seed: string }) {
  // Generate a pseudo-unique hex from the seed
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
      <div className="barcode-label">{hex} // BADGE_OS</div>
    </>
  );
}

function maskKey(key: string): string {
  return "AK_\u2022\u2022\u2022\u2022" + key.slice(-4).toUpperCase();
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchAgents = async () => {
    const res = await fetch(`${API}/agents`);
    setAgents(await res.json());
  };

  useEffect(() => { fetchAgents(); }, []);

  const createAgent = async () => {
    if (!name.trim()) return;
    await fetch(`${API}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setName("");
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
                  <div className="agent-name">{agent.name}</div>
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
                    <span className="data-val">ALL_VAULTS</span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Key Sig</span>
                    <span className="data-val api-key-mask">{maskKey(agent.apiKey)}</span>
                  </div>
                  <div className="data-row status-row">
                    <span className="data-label">Status</span>
                    <span className="data-val" style={{ color: "#00c853" }}>
                      <span className="status-led active" />ACTIVE
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Barcode seed={agent.id} />

            <div className="badge-footer">
              <span className="badge-footer-text">AGENT BADGE // BADGE_OS v2.1</span>
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
