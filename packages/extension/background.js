// Agent Badge — background service worker
// Handles API communication with the Agent Badge SaaS backend.
// Credentials flow through here but are NEVER stored in memory longer than
// the lifetime of a single message-response cycle.

const API_BASE = "https://agent-badge.onrender.com";

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_CREDENTIALS") {
    handleFetchCredentials(message.site, sender.tab?.id)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for async response
  }

  if (message.type === "GET_STATUS") {
    handleGetStatus()
      .then(sendResponse)
      .catch((err) => sendResponse({ connected: false, error: err.message }));
    return true;
  }
});

async function getApiKey() {
  const result = await chrome.storage.local.get("agentApiKey");
  return result.agentApiKey || null;
}

async function handleFetchCredentials(site, tabId) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { success: false, error: "No API key configured. Open the Agent Badge popup to set one." };
  }

  const response = await fetch(`${API_BASE}/credentials/${encodeURIComponent(site)}`, {
    headers: {
      "X-Agent-Key": apiKey,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    return { success: false, error: `Backend returned ${response.status}: ${body}` };
  }

  const data = await response.json();

  // Log the credential access event
  try {
    await fetch(`${API_BASE}/activity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agentApiKey: apiKey,
        action: "credential_access",
        site
      })
    });
  } catch (_) {
    // Activity logging is best-effort; don't block credential flow
  }

  // Return credentials to the content script for DOM injection.
  // These MUST NOT be forwarded to the WebMCP tool return value.
  // Map backend field names to what the content script expects.
  return { success: true, credentials: { username: data.email, password: data.password } };
}

async function handleGetStatus() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { connected: false, agentName: null };
  }

  try {
    const response = await fetch(`${API_BASE}/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ apiKey })
    });

    if (!response.ok) {
      return { connected: false, agentName: null };
    }

    const data = await response.json();
    return { connected: true, agentName: data.agent?.name || "Unknown" };
  } catch (_) {
    return { connected: false, agentName: null };
  }
}
