import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface Session {
  id: string;
  prompt: string;
  status: "running" | "completed" | "error";
  logs: string[];
  result?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

function App() {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll sessions while any are running
  useEffect(() => {
    fetchSessions();

    pollRef.current = setInterval(() => {
      const hasRunning = sessions.some((s) => s.status === "running");
      if (hasRunning) fetchSessions();
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessions.some((s) => s.status === "running")]);

  async function fetchSessions() {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) setSessions(await res.json());
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (res.ok) {
        const { id } = await res.json();
        setPrompt("");
        setExpandedId(id);
        await fetchSessions();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  return (
    <div className="runner-app">
      <header className="runner-header">
        <h1>Agent Runner</h1>
        <span className="tag">browser-use</span>
      </header>

      <form className="prompt-form" onSubmit={handleSubmit}>
        <label htmlFor="prompt-input">Prompt</label>
        <textarea
          id="prompt-input"
          className="prompt-textarea"
          placeholder="Enter a task for the browser agent...&#10;&#10;e.g. Go to news.ycombinator.com and tell me the top 3 stories"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit(e);
            }
          }}
        />
        <button className="submit-btn" type="submit" disabled={!prompt.trim() || submitting}>
          {submitting ? "Launching..." : "Execute"}
        </button>
      </form>

      <section className="sessions-section">
        <div className="sessions-header">
          Sessions {sessions.length > 0 && `(${sessions.length})`}
        </div>

        {sessions.length === 0 && (
          <div className="empty-state">No sessions yet. Submit a prompt to start.</div>
        )}

        {sessions.map((s) => {
          const isExpanded = expandedId === s.id;
          return (
            <div
              key={s.id}
              className={`session-card${isExpanded ? " expanded" : ""}`}
              onClick={() => setExpandedId(isExpanded ? null : s.id)}
            >
              <div className="session-meta">
                <span className="session-prompt-preview">{s.prompt}</span>
                <span className={`session-status ${s.status}`}>{s.status}</span>
              </div>
              <div className="session-time">{formatTime(s.startedAt)}</div>

              {isExpanded && (
                <div className="session-detail">
                  <div className="session-detail-label">Full Prompt</div>
                  <pre>{s.prompt}</pre>

                  {s.logs.length > 0 && (
                    <>
                      <div className="session-detail-label" style={{ marginTop: 12 }}>
                        Logs
                      </div>
                      <pre>
                        {s.logs.map((l, i) => (
                          <div key={i} className="log-line">
                            {l}
                          </div>
                        ))}
                      </pre>
                    </>
                  )}

                  {s.result && (
                    <>
                      <div className="session-detail-label" style={{ marginTop: 12 }}>
                        Result
                      </div>
                      <pre className="result-text">{s.result}</pre>
                    </>
                  )}

                  {s.error && (
                    <>
                      <div className="session-detail-label" style={{ marginTop: 12 }}>
                        Error
                      </div>
                      <pre className="error-text">{s.error}</pre>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
