// Agent Badge — content script
// Injected into every page. Detects login forms and registers the WebMCP
// login_to() tool so AI agents can authenticate without seeing credentials.

(function () {
  "use strict";

  // Avoid double-injection
  if (window.__agentBadgeInjected) return;
  window.__agentBadgeInjected = true;

  // --- Login form detection ---

  function findPasswordInput() {
    return document.querySelector('input[type="password"]');
  }

  function findUsernameInput() {
    const selectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[name="login"]',
      'input[name="user"]',
      'input[id="email"]',
      'input[id="username"]',
      'input[id="login"]',
      'input[autocomplete="username"]',
      'input[autocomplete="email"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Fallback: first text/email input that's a sibling-ish of a password field
    const passwordInput = findPasswordInput();
    if (passwordInput) {
      const form = passwordInput.closest("form");
      if (form) {
        const candidate = form.querySelector('input[type="text"], input[type="email"]');
        if (candidate) return candidate;
      }
    }
    return null;
  }

  function findSubmitButton() {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:not([type])'
    ];
    const passwordInput = findPasswordInput();
    const form = passwordInput?.closest("form");
    const scope = form || document;

    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function hasLoginForm() {
    return !!findPasswordInput();
  }

  // --- DOM credential injection ---

  function setNativeValue(input, value) {
    // Use the native setter so frameworks (React, etc.) pick up the change
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value"
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillAndSubmit(credentials) {
    const usernameInput = findUsernameInput();
    const passwordInput = findPasswordInput();

    if (!passwordInput) {
      return { success: false, message: "Could not find password field on this page." };
    }

    if (usernameInput && credentials.username) {
      setNativeValue(usernameInput, credentials.username);
    }
    setNativeValue(passwordInput, credentials.password);

    // Brief pause so the page can process the input events
    await new Promise((r) => setTimeout(r, 100));

    // Submit
    const form = passwordInput.closest("form");
    if (form) {
      form.requestSubmit?.() ?? form.submit();
    } else {
      const btn = findSubmitButton();
      if (btn) {
        btn.click();
      } else {
        return { success: true, message: "Credentials filled but no submit button found. The agent may need to click submit." };
      }
    }

    return { success: true, message: "Logged in successfully." };
  }

  // --- WebMCP tool registration ---

  let loginToolRegistered = false;

  function registerLoginTool() {
    if (loginToolRegistered) return;
    if (typeof navigator.modelContext === "undefined") {
      // WebMCP not available in this browser — silently skip
      return;
    }

    loginToolRegistered = true;
    navigator.modelContext.registerTool({
      name: "login_to",
      description:
        "Log into this website using credentials from the Agent Badge vault. " +
        "The extension handles authentication securely — credentials never appear in the response.",
      inputSchema: {
        type: "object",
        properties: {
          site: {
            type: "string",
            description: "The site identifier to log into (e.g. 'crm', 'github')"
          }
        },
        required: ["site"]
      },
      execute: async (input) => {
        const site = input.site;

        if (!hasLoginForm()) {
          return { result: "No login form detected on this page." };
        }

        // Ask background.js to fetch credentials from the SaaS backend
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: "FETCH_CREDENTIALS", site },
            resolve
          );
        });

        if (!response || !response.success) {
          const reason = response?.error || "Unknown error";
          return { result: `Failed to fetch credentials: ${reason}` };
        }

        // Fill form and submit — credentials stay in this closure scope
        // and are NEVER returned to the tool caller
        const fillResult = await fillAndSubmit(response.credentials);

        // SECURITY: return only success/failure, never credential values
        return { result: fillResult.message };
      }
    });
  }

  // --- Google Sign-In detection and tool ---

  function hasGoogleSignIn() {
    // Detect common Google Sign-In patterns
    const selectors = [
      '[data-login_uri]',           // Google Identity Services callback URL
      '.g_id_signin',               // GIS rendered button container
      '.gsi-material-button',       // GIS material-styled button
      '[data-client_id]',           // GIS client ID attribute
      'iframe[src*="accounts.google.com"]',
      'a[href*="accounts.google.com/o/oauth2"]',
      'a[href*="accounts.google.com/signin"]',
      'button[data-provider="google"]',
      '[class*="google-sign"]',
      '[id*="google-sign"]',
    ];
    for (const sel of selectors) {
      if (document.querySelector(sel)) return true;
    }
    return false;
  }

  let googleSignInToolRegistered = false;

  function registerGoogleSignInTool() {
    if (googleSignInToolRegistered) return;
    if (typeof navigator.modelContext === "undefined") return;

    googleSignInToolRegistered = true;
    navigator.modelContext.registerTool({
      name: "google_signin",
      description:
        "Sign into this website using Google OAuth via Agent Badge. " +
        "The extension handles the sign-in flow securely — tokens never appear in the response.",
      inputSchema: {
        type: "object",
        properties: {
          oauthConnectionId: {
            type: "string",
            description: "The OAuth connection ID from Agent Badge to use for sign-in"
          }
        },
        required: ["oauthConnectionId"]
      },
      execute: async (input) => {
        if (!hasGoogleSignIn()) {
          return { result: "No Google Sign-In detected on this page." };
        }

        // Request ID token from background.js
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: "FETCH_OAUTH_TOKEN", oauthConnectionId: input.oauthConnectionId },
            resolve
          );
        });

        if (!response || !response.success) {
          const reason = response?.error || "Unknown error";
          // Log failure (best-effort)
          try {
            chrome.runtime.sendMessage({
              type: "LOG_ACTIVITY",
              action: "oauth_signin_failed",
              site: window.location.hostname
            });
          } catch (_) {}
          return { result: `Failed to get OAuth token: ${reason}` };
        }

        // Primary strategy: find data-login_uri and POST the credential
        const loginUriEl = document.querySelector('[data-login_uri]');
        if (loginUriEl && response.idToken) {
          const loginUri = loginUriEl.getAttribute('data-login_uri');
          try {
            const postResponse = await fetch(loginUri, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                credential: response.idToken,
                g_csrf_token: getCsrfToken()
              }),
              credentials: "include"
            });

            if (postResponse.ok || postResponse.redirected) {
              // Log success (best-effort)
              try {
                chrome.runtime.sendMessage({
                  type: "LOG_ACTIVITY",
                  action: "oauth_signin_success",
                  site: window.location.hostname
                });
              } catch (_) {}

              // Reload to pick up the new session
              window.location.reload();
              return { result: "Google Sign-In successful. Page is reloading." };
            }
            return { result: `Google Sign-In POST returned status ${postResponse.status}. The site may require a different sign-in flow.` };
          } catch (err) {
            return { result: `Google Sign-In POST failed: ${err.message}` };
          }
        }

        // Fallback: click the Google Sign-In button
        const googleBtn = document.querySelector(
          '.gsi-material-button, .g_id_signin button, [data-provider="google"], [class*="google-sign"] button, button[class*="google"]'
        );
        if (googleBtn) {
          googleBtn.click();
          return { result: "Clicked Google Sign-In button. The OAuth redirect flow should proceed." };
        }

        return { result: "Google Sign-In elements detected but could not interact with them automatically." };
      }
    });
  }

  function getCsrfToken() {
    // Try to read g_csrf_token cookie
    const match = document.cookie.match(/g_csrf_token=([^;]+)/);
    return match ? match[1] : "";
  }

  // --- Manual test trigger (Ctrl+Shift+L) ---
  document.addEventListener("keydown", async (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "L") {
      console.log("[Agent Badge] Manual login trigger...");
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "FETCH_CREDENTIALS", site: "crm" },
          resolve
        );
      });
      console.log("[Agent Badge] Backend response:", response);
      if (response?.success) {
        const result = await fillAndSubmit(response.credentials);
        console.log("[Agent Badge] Fill result:", result);
      } else {
        console.error("[Agent Badge] Failed:", response?.error);
      }
    }
  });

  // --- Initialization ---

  if (hasLoginForm()) {
    registerLoginTool();
  }
  if (hasGoogleSignIn()) {
    registerGoogleSignInTool();
  }

  // Also watch for dynamically added login forms and Google Sign-In (SPAs)
  const observer = new MutationObserver(() => {
    if (hasLoginForm()) registerLoginTool();
    if (hasGoogleSignIn()) registerGoogleSignInTool();
    if (loginToolRegistered && googleSignInToolRegistered) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
