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

  if (message.type === "FETCH_OAUTH_TOKEN") {
    handleFetchOAuthToken(message.oauthConnectionId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "CHECK_GOOGLE_SESSION") {
    handleCheckGoogleSession(message.oauthConnectionId)
      .then(sendResponse)
      .catch((err) => sendResponse({ hasSession: null, error: err.message }));
    return true;
  }

  if (message.type === "LOG_ACTIVITY") {
    handleLogActivity(message.action, message.site).catch(() => {});
    // Fire-and-forget — respond immediately
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "FETCH_OTP") {
    handleFetchOtp()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
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
        "X-Agent-Key": apiKey,
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

async function handleFetchOAuthToken(oauthConnectionId) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { success: false, error: "No API key configured. Open the Agent Badge popup to set one." };
  }

  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "X-Agent-Key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ oauthConnectionId })
  });

  if (!response.ok) {
    const body = await response.text();
    return { success: false, error: `Backend returned ${response.status}: ${body}` };
  }

  const data = await response.json();
  return {
    success: true,
    idToken: data.idToken,
    accessToken: data.accessToken,
    expiresIn: data.expiresIn,
    googleEmail: data.googleEmail
  };
}

async function handleCheckGoogleSession(oauthConnectionId) {
  // 1. Get the expected email from our backend
  const tokenResult = await handleFetchOAuthToken(oauthConnectionId);
  if (!tokenResult.success) {
    return { hasSession: null, expectedEmail: null, error: tokenResult.error };
  }
  const expectedEmail = tokenResult.googleEmail;

  // 2. Check browser's Google sessions via ListAccounts
  let sessionEmails = [];
  try {
    const response = await fetch(
      "https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser",
      { credentials: "include" }
    );
    if (response.ok) {
      const text = await response.text();
      sessionEmails = parseListAccountsEmails(text);
    }
  } catch (_) {
    // ListAccounts failed — return unknown session status so caller can try clicking anyway
    return {
      hasSession: null,
      expectedEmail,
      sessionEmails: [],
      idToken: tokenResult.idToken
    };
  }

  const hasSession = expectedEmail
    ? sessionEmails.some((e) => e.toLowerCase() === expectedEmail.toLowerCase())
    : sessionEmails.length > 0;

  return {
    hasSession,
    expectedEmail,
    sessionEmails,
    idToken: tokenResult.idToken
  };
}

// Parse emails from Google's ListAccounts response.
// The response is a JSON-like nested array. Emails appear as strings containing "@".
function parseListAccountsEmails(text) {
  const emails = [];
  try {
    const data = JSON.parse(text);
    extractEmails(data, emails);
  } catch (_) {
    // If JSON parsing fails, try regex extraction as fallback
    const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
      emails.push(...new Set(matches));
    }
  }
  return emails;
}

function extractEmails(obj, result) {
  if (typeof obj === "string" && obj.includes("@") && obj.includes(".")) {
    // Basic email pattern check
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(obj)) {
      result.push(obj);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractEmails(item, result);
    }
  }
}

async function handleFetchOtp() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { success: false, error: "No API key configured. Open the Agent Badge popup to set one." };
  }

  // Retry up to 5 times with 3-second intervals (OTP emails may take a few seconds)
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 3000));
    }

    const response = await fetch(`${API_BASE}/otp/fetch`, {
      method: "POST",
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
    if (data.success && data.otp) {
      return data;
    }

    // If it's not a "not found" error, don't retry
    if (data.error && !data.error.includes("No OTP email found")) {
      return data;
    }
  }

  return { success: false, error: "No OTP email received after 5 attempts (15 seconds)" };
}

async function handleLogActivity(action, site) {
  const apiKey = await getApiKey();
  if (!apiKey) return;

  await fetch(`${API_BASE}/activity`, {
    method: "POST",
    headers: { "X-Agent-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ agentApiKey: apiKey, action, site })
  });
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
        "X-Agent-Key": apiKey,
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
