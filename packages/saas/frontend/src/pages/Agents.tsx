import { useEffect, useState, useRef, useCallback, type MouseEvent } from "react";

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

interface DialogState {
  type: "confirm" | "alert";
  variant?: "delete";
  title: string;
  message: string;
  content?: string;
  onConfirm: () => void;
}

function TerminalDialog({
  dialog,
  onClose,
}: {
  dialog: DialogState;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleConfirm = () => {
    dialog.onConfirm();
    onClose();
  };

  const handleCopy = async () => {
    if (dialog.content) {
      await navigator.clipboard.writeText(dialog.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="term-dialog-backdrop" onClick={onClose}>
      <div
        className={`term-dialog${dialog.variant === "delete" ? " delete" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="term-dialog-title">{dialog.title}</div>
        <div className="term-dialog-message">{dialog.message}</div>
        {dialog.content && (
          <div className="term-dialog-content">{dialog.content}</div>
        )}
        <div className="term-dialog-actions">
          {dialog.type === "confirm" ? (
            <>
              <button className="row-action-btn" onClick={onClose}>Cancel</button>
              <button
                className={`row-action-btn${dialog.variant === "delete" ? " delete" : ""}`}
                onClick={handleConfirm}
              >
                Confirm
              </button>
            </>
          ) : (
            <>
              {dialog.content && (
                <button className="row-action-btn" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy Key"}
                </button>
              )}
              <button className="row-action-btn" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EngraverDialog({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const badgeRef = useRef<HTMLDivElement>(null);
  const gantryRef = useRef<HTMLDivElement>(null);
  const laserHeadRef = useRef<HTMLDivElement>(null);
  const laserBeamRef = useRef<HTMLDivElement>(null);
  const printedDataRef = useRef<HTMLDivElement>(null);
  const pistonRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");

  const appendLog = useCallback((msg: string) => {
    if (!logRef.current) return;
    logRef.current.innerHTML += `<br>> ${msg}`;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, []);

  const startLaserSound = useCallback(() => {
    const ctx = new AudioContext();
    // High-pitched sine for the laser hum
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 2200;
    // Slight modulation for scanning feel
    const lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain).connect(osc.frequency);
    // Subtle noise layer
    const bufferSize = ctx.sampleRate * 5;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 3000;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.04;
    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = 0.08;
    osc.connect(master).connect(ctx.destination);
    osc.start();
    lfo.start();
    noise.start();
    return () => {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      noiseGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      setTimeout(() => { osc.stop(); lfo.stop(); noise.stop(); ctx.close(); }, 300);
    };
  }, []);

  const playStampSound = useCallback(() => {
    const ctx = new AudioContext();
    // Low thud
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    // Impact noise burst
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.3;
    noiseSrc.connect(noiseGain).connect(ctx.destination);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    noiseSrc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 500);
  }, []);

  const startIssuance = useCallback(() => {
    if (phase !== "ready") return;
    setPhase("running");
    const badge = badgeRef.current!;
    const gantry = gantryRef.current!;
    const laserBeam = laserBeamRef.current!;
    const laserHead = laserHeadRef.current!;
    const printedData = printedDataRef.current!;
    const piston = pistonRef.current!;
    const hole = holeRef.current!;

    logRef.current!.innerHTML = "> PROTOCOL INITIATED.";

    // Phase 1: Load blank
    setTimeout(() => {
      appendLog("LOADING BLANK MEDIA...");
      badge.style.transform = "translateY(0) scale(1)";
      badge.style.opacity = "1";
    }, 500);

    // Phase 2: Laser engraving
    setTimeout(() => {
      appendLog("ENGAGING UV RESIN LASER...");
      gantry.style.display = "flex";
      gantry.style.top = "10%";
      laserBeam.style.opacity = "1";
      laserHead.style.animation = "engraver-scan-x 0.15s infinite alternate ease-in-out";

      const stopLaser = startLaserSound();

      let progress = 10;
      function scanDown() {
        progress += 0.4;
        gantry.style.top = `${progress}%`;
        printedData.style.clipPath = `inset(0 0 ${100 - progress}% 0)`;
        if (progress < 90) {
          requestAnimationFrame(scanDown);
        } else {
          // Phase 3: finish scan
          stopLaser();
          laserBeam.style.opacity = "0";
          laserHead.style.animation = "none";
          gantry.style.display = "none";
          appendLog("CURING COMPLETE. ALIGNING STAMP...");
          setTimeout(stampHole, 800);
        }
      }
      requestAnimationFrame(scanDown);
    }, 1500);

    // Phase 4: Hydraulic punch
    function stampHole() {
      piston.style.opacity = "1";
      requestAnimationFrame(() => {
        piston.style.transform = "translateX(-50%) translateY(0px) scale(1.1)";
        setTimeout(() => {
          playStampSound();
          hole.style.opacity = "1";
          appendLog("LANYARD APERTURE PUNCHED.");
          // Screen shake
          const scene = badge.closest(".engraver-scene") as HTMLElement;
          if (scene) {
            scene.style.transform = "translateY(5px)";
            setTimeout(() => { scene.style.transform = ""; }, 50);
          }
          // Piston retracts
          piston.style.transition = "transform 0.5s ease-out";
          piston.style.transform = "translateX(-50%) translateY(-100px) scale(0.8)";
          setTimeout(finalize, 600);
        }, 150);
      });
    }

    // Phase 5: Present badge
    function finalize() {
      piston.style.opacity = "0";
      badge.style.boxShadow = "inset 2px 2px 4px #fff, inset -2px -2px 6px var(--cream-shadow), 15px 15px 30px rgba(0,0,0,0.8)";
      badge.style.transform = "translateY(-5px) scale(1.02)";
      appendLog("BADGE ISSUED SUCCESSFULLY.");
      setPhase("done");
    }
  }, [phase, appendLog, startLaserSound, playStampSound]);

  const status = computeStatus(agent.lastActivityAt, agent.expiresAt);

  return (
    <div className="engraver-backdrop">
      <div className="engraver-scene">
        <div className="engraver-machine-tray">
          <div className="engraver-tray-bed">
            <div className="engraver-badge-base" ref={badgeRef}>
              <div className="engraver-mag-stripe" />
              <div className="engraver-punch-hole" ref={holeRef} />
              <div className="engraver-printed-data" ref={printedDataRef}>
                <div className="destructor-agent-name">{agent.name}</div>
                <div className="destructor-data-row"><span style={{ color: "#666" }}>CLEARANCE</span> <span>{agent.linkedCredentials.length > 0 ? `LVL_01 (${agent.linkedCredentials.length} VAULT${agent.linkedCredentials.length > 1 ? "S" : ""})` : "NONE"}</span></div>
                <div className="destructor-data-row"><span style={{ color: "#666" }}>KEY_SIG</span> <span>{maskKey(agent.apiKey)}</span></div>
                <div className="destructor-data-row" style={{ marginTop: 20, borderTop: "1px dashed #ccc", paddingTop: 15 }}>
                  <span style={{ color: "#666" }}>STATUS</span>
                  <span style={{ color: status.color, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, background: status.color, borderRadius: "50%", boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.5)", display: "inline-block" }} /> {status.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="engraver-gantry" ref={gantryRef}>
              <div className="engraver-laser-head" ref={laserHeadRef}>
                <div className="engraver-laser-beam" ref={laserBeamRef} />
              </div>
            </div>

            <div className="engraver-piston" ref={pistonRef} />
          </div>
        </div>

        <div className="engraver-controls">
          <div className="engraver-sys-log" ref={logRef}>{"> SYSTEM READY."}<br />{"> AWAITING ISSUANCE PROTOCOL."}</div>
          <div style={{ display: "flex", gap: 12 }}>
            {phase !== "running" && (
              <button className="row-action-btn" onClick={onClose}>
                {phase === "done" ? "Close" : "Cancel"}
              </button>
            )}
            {phase === "ready" && (
              <button className="engraver-issue-btn" onClick={startIssuance}>
                Initialize Resin Engraver
              </button>
            )}
            {phase === "done" && (
              <button className="engraver-issue-btn" onClick={onClose}>
                Badge Ready for Agent
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DestructorDialog({
  agent,
  onConfirm,
  onClose,
}: {
  agent: Agent;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const badgeRef = useRef<HTMLDivElement>(null);
  const machineRef = useRef<HTMLDivElement>(null);
  const [shredding, setShredding] = useState(false);

  const spawnDebris = useCallback(() => {
    const machineFront = machineRef.current?.querySelector(".destructor-machine-front");
    if (!machineFront) return;
    const debris = document.createElement("div");
    debris.className = "destructor-debris";
    if (Math.random() > 0.8) debris.style.background = "var(--alert-red)";
    const startX = (Math.random() * 280) - 140;
    debris.style.transform = `translateX(${startX}px)`;
    machineFront.appendChild(debris);
    const angle = (Math.random() * 60) - 30;
    const throwHeight = Math.random() * -100 - 50;
    debris.animate([
      { transform: `translate(${startX}px, 0px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${startX + angle}px, ${throwHeight}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${startX + angle * 2}px, 100px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], {
      duration: 600 + Math.random() * 400,
      easing: "cubic-bezier(.25,.8,.25,1)",
    }).onfinish = () => debris.remove();
  }, []);

  const startShredSound = useCallback(() => {
    const ctx = new AudioContext();
    // White noise buffer for the shredding texture
    const bufferSize = ctx.sampleRate * 10;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    // Bandpass filter to make it sound more mechanical
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.8;
    // Low grinding oscillator
    const grind = ctx.createOscillator();
    grind.type = "sawtooth";
    grind.frequency.value = 42;
    const grindGain = ctx.createGain();
    grindGain.gain.value = 0.15;
    // Master gain
    const master = ctx.createGain();
    master.gain.value = 0.25;
    noise.connect(filter).connect(master);
    grind.connect(grindGain).connect(master);
    master.connect(ctx.destination);
    noise.start();
    grind.start();
    return () => {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      setTimeout(() => { noise.stop(); grind.stop(); ctx.close(); }, 400);
    };
  }, []);

  const engage = useCallback(() => {
    const badge = badgeRef.current;
    if (!badge || shredding) return;
    setShredding(true);
    const stopSound = startShredSound();
    let depth = 0;
    badge.style.animation = "destructor-shake 0.08s infinite";
    const interval = setInterval(() => {
      depth += 2;
      badge.style.setProperty("--grind-depth", `${depth}px`);
      if (depth % 6 === 0) spawnDebris();
      if (depth > 380) {
        clearInterval(interval);
        stopSound();
        badge.style.display = "none";
        setShredding(false);
        onConfirm();
        setTimeout(onClose, 400);
      }
    }, 20);
  }, [shredding, spawnDebris, startShredSound, onConfirm, onClose]);

  const status = computeStatus(agent.lastActivityAt, agent.expiresAt);

  return (
    <div className="destructor-backdrop" onClick={onClose}>
      <div className="destructor-scene" onClick={(e) => e.stopPropagation()}>
        <div className="destructor-badge-wrapper">
          <div className="destructor-badge" ref={badgeRef} style={{ "--grind-depth": "0px" } as React.CSSProperties}>
            <div className="destructor-punch-hole" />
            <div className="destructor-mag-stripe" />
            <div className="destructor-agent-name">{agent.name}</div>
            <div className="destructor-data-row"><span>CLEARANCE:</span> <strong>{agent.linkedCredentials.length > 0 ? `${agent.linkedCredentials.length} VAULT${agent.linkedCredentials.length > 1 ? "S" : ""}` : "NONE"}</strong></div>
            <div className="destructor-data-row"><span>KEY_SIG:</span> <strong>{maskKey(agent.apiKey)}</strong></div>
            <div className="destructor-data-row"><span>STATUS:</span> <strong style={{ color: status.color }}>{status.label}</strong></div>
          </div>
        </div>

        <div className={`destructor-machine${shredding ? " shredding" : ""}`} ref={machineRef}>
          <div className="destructor-machine-front">
            <div className="destructor-caution-tape" />
            <div className="destructor-slot">
              <div className="destructor-slot-glow" />
              <div className="destructor-teeth" />
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.6rem", color: "#777", marginTop: 15, letterSpacing: 2 }}>LUMON HW_DESTRUCTOR v2</div>
          </div>
        </div>

        <div className="destructor-controls">
          <button className="row-action-btn" onClick={onClose} disabled={shredding}>Cancel</button>
          <button className="destructor-engage-btn" onClick={engage} disabled={shredding}>
            {shredding ? "DESTROYING..." : "Engage Destructor"}
          </button>
        </div>
      </div>
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
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [destructorAgent, setDestructorAgent] = useState<Agent | null>(null);
  const [engraverAgent, setEngraverAgent] = useState<Agent | null>(null);
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
    const res = await fetch(`${API}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() }),
    });
    if (res.ok) {
      const raw = await res.json();
      const created: Agent = {
        ...raw,
        lastActivityAt: raw.lastActivityAt ?? null,
        recentActivity: raw.recentActivity ?? [],
        deniedCount: raw.deniedCount ?? 0,
        linkedCredentials: raw.linkedCredentials ?? [],
        linkedOAuthConnections: raw.linkedOAuthConnections ?? [],
        mailboxAddress: raw.mailboxAddress ?? null,
      };
      setName("");
      setDescription("");
      fetchAgents();
      setEngraverAgent(created);
    }
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

  const deleteAgent = (agent: Agent) => {
    setDestructorAgent(agent);
  };

  const confirmDeleteAgent = async (id: string) => {
    await fetch(`${API}/agents/${id}`, { method: "DELETE" });
    fetchAgents();
  };

  const rotateKey = (id: string) => {
    setDialog({
      type: "confirm",
      title: "Rotate Key",
      message: "Rotate API key? The current key will stop working immediately.",
      onConfirm: async () => {
        const res = await fetch(`${API}/agents/${id}/rotate-key`, { method: "PATCH" });
        if (res.ok) {
          const updated = await res.json();
          setDialog({
            type: "alert",
            title: "Key Rotated",
            message: "Copy this now — it won't be shown again.",
            content: updated.apiKey,
            onConfirm: () => {},
          });
          fetchAgents();
        }
      },
    });
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
                  onClick={() => deleteAgent(agent)}
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

      {engraverAgent && (
        <EngraverDialog
          agent={engraverAgent}
          onClose={() => setEngraverAgent(null)}
        />
      )}

      {destructorAgent && (
        <DestructorDialog
          agent={destructorAgent}
          onConfirm={() => confirmDeleteAgent(destructorAgent.id)}
          onClose={() => setDestructorAgent(null)}
        />
      )}

      {dialog && (
        <TerminalDialog dialog={dialog} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
