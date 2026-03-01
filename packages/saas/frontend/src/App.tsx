import { useState, useEffect } from "react";
import Agents from "./pages/Agents";
import Credentials from "./pages/Credentials";
import Activity from "./pages/Activity";
import OAuth from "./pages/OAuth";

const NAV_ITEMS = [
  { id: "agents", label: "Assigned Badges" },
  { id: "vaults", label: "Vault Nodes" },
  { id: "oauth", label: "OAuth Links" },
  { id: "activity", label: "Audit Stream" },
] as const;

type Page = (typeof NAV_ITEMS)[number]["id"];

const VIEW_TITLES: Record<Page, string> = {
  agents: "ASSIGNED BADGES",
  vaults: "VAULT NODES",
  oauth: "OAUTH LINKS",
  activity: "AUDIT STREAM",
};

export default function App() {
  const [page, setPage] = useState<Page>(() => {
    // Handle hash-based navigation from OAuth callback
    if (window.location.hash === "#oauth") return "oauth";
    return "agents";
  });

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#oauth") setPage("oauth");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <>
      <nav>
        <div className="sys-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8M12 8v8" />
          </svg>
          BADGE_OS
        </div>

        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-btn${page === item.id ? " active" : ""}`}
            onClick={() => setPage(item.id)}
          >
            {item.label}
          </button>
        ))}

        <button className="print-btn" onClick={() => {
          const el = document.querySelector<HTMLInputElement>('.term-input');
          el?.focus();
        }}>
          Print New Badge
        </button>
      </nav>

      <main>
        <div className="term-header">
          <div className="term-box">{VIEW_TITLES[page]}</div>
          <div className="progress-track">
            <div className="progress-segment" />
            <div className="progress-segment" />
            <div className="progress-segment" />
            <div className="progress-segment" />
            <div className="progress-segment" />
            <div className="progress-segment empty" />
            <div className="progress-segment empty" />
            <span style={{ marginLeft: 10, fontFamily: "'Inter', sans-serif", fontSize: "0.8rem" }}>
              SEC_LVL 05
            </span>
          </div>
        </div>

        <div className="view-animate" key={page}>
          {page === "agents" && <Agents />}
          {page === "vaults" && <Credentials />}
          {page === "oauth" && <OAuth />}
          {page === "activity" && <Activity />}
        </div>
      </main>
    </>
  );
}
