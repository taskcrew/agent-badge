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

  // --- OTP form detection ---

  function hasOtpForm() {
    const selectors = [
      'input[autocomplete="one-time-code"]',
      'input[name*="otp"]',
      'input[name*="verification"]',
      'input[name*="token"][type="text"]',
      'input[name*="token"][type="tel"]',
      'input[name*="token"][type="number"]',
      'input[id*="otp"]',
      'input[type="tel"][maxlength="6"]',
      'input[type="tel"][maxlength="4"]',
      'input[type="number"][maxlength="6"]',
      'input[type="number"][maxlength="4"]',
    ];
    for (const sel of selectors) {
      if (document.querySelector(sel)) return true;
    }

    // Check for name/id containing "code" but not password-related
    const codeInputs = document.querySelectorAll('input[name*="code"], input[id*="code"]');
    for (const input of codeInputs) {
      const name = (input.name || "").toLowerCase();
      const id = (input.id || "").toLowerCase();
      if (name.includes("passcode") || name.includes("password")) continue;
      if (id.includes("passcode") || id.includes("password")) continue;
      if (input.type === "hidden") continue;
      return true;
    }

    // Detect split-digit inputs (multiple single-char inputs in a row)
    const singleDigitInputs = document.querySelectorAll(
      'input[maxlength="1"][type="text"], input[maxlength="1"][type="tel"], input[maxlength="1"][type="number"]'
    );
    if (singleDigitInputs.length >= 4 && singleDigitInputs.length <= 8) return true;

    return false;
  }

  function findOtpInputs() {
    // Check for split-digit inputs first
    const singleDigitInputs = document.querySelectorAll(
      'input[maxlength="1"][type="text"], input[maxlength="1"][type="tel"], input[maxlength="1"][type="number"]'
    );
    if (singleDigitInputs.length >= 4 && singleDigitInputs.length <= 8) {
      return { type: "split", inputs: Array.from(singleDigitInputs) };
    }

    // Single input field
    const selectors = [
      'input[autocomplete="one-time-code"]',
      'input[name*="otp"]',
      'input[name*="verification"]',
      'input[name*="token"][type="text"]',
      'input[name*="token"][type="tel"]',
      'input[name*="token"][type="number"]',
      'input[id*="otp"]',
      'input[type="tel"][maxlength="6"]',
      'input[type="tel"][maxlength="4"]',
      'input[type="number"][maxlength="6"]',
      'input[type="number"][maxlength="4"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return { type: "single", inputs: [el] };
    }

    // Code inputs (excluding password-related)
    const codeInputs = document.querySelectorAll('input[name*="code"], input[id*="code"]');
    for (const input of codeInputs) {
      const name = (input.name || "").toLowerCase();
      const id = (input.id || "").toLowerCase();
      if (name.includes("passcode") || name.includes("password")) continue;
      if (id.includes("passcode") || id.includes("password")) continue;
      if (input.type === "hidden") continue;
      return { type: "single", inputs: [input] };
    }

    return null;
  }

  function fillOtp(code) {
    const result = findOtpInputs();
    if (!result) return false;

    if (result.type === "split") {
      const digits = code.split("");
      for (let i = 0; i < result.inputs.length && i < digits.length; i++) {
        setNativeValue(result.inputs[i], digits[i]);
      }
    } else {
      setNativeValue(result.inputs[0], code);
    }
    return true;
  }

  function findOtpSubmitButton() {
    const result = findOtpInputs();
    if (!result) return null;
    const input = result.inputs[0];
    const form = input.closest("form");
    const scope = form || document;

    const selectors = ['button[type="submit"]', 'input[type="submit"]', 'button:not([type])'];
    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      if (el) return el;
    }
    return null;
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
            description: "Optional site label hint (e.g. 'crm', 'github'). If omitted, credentials are matched by the current page URL."
          }
        },
        required: []
      },
      execute: async (input) => {
        const site = input.site || "";
        const url = window.location.origin;

        if (!hasLoginForm()) {
          return { result: "No login form detected on this page." };
        }

        // Ask background.js to fetch credentials from the SaaS backend
        // Pass both URL (primary) and site label (fallback)
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: "FETCH_CREDENTIALS", site, url },
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

  // --- Google Sign-In helpers ---

  function clickGoogleSignInButton() {
    // Try multiple selectors in priority order
    const selectors = [
      // GIS rendered buttons
      '.gsi-material-button',
      '.g_id_signin button',
      '.g_id_signin div[role="button"]',
      '.g_id_signin',
      // Common third-party patterns
      'button[data-provider="google"]',
      '[class*="google-sign"] button',
      '[class*="google-sign"]',
      'button[class*="google"]',
      '[id*="google-sign"] button',
      '[id*="google-sign"]',
      // OAuth links
      'a[href*="accounts.google.com/o/oauth2"]',
      'a[href*="accounts.google.com/signin"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        el.click();
        return true;
      }
    }
    return false;
  }

  function waitForSignInSuccess(timeoutMs) {
    return new Promise((resolve) => {
      const startUrl = window.location.href;
      const startTime = Date.now();

      // Indicators that sign-in succeeded
      function checkSuccess() {
        // URL changed (redirect after OAuth)
        if (window.location.href !== startUrl) {
          return "URL changed after sign-in — OAuth redirect completed.";
        }
        // Login elements disappeared
        if (!hasGoogleSignIn() && !hasLoginForm()) {
          return "Sign-in elements disappeared — login likely succeeded.";
        }
        // User menu / avatar appeared (common post-login indicators)
        const userIndicators = [
          '[class*="user-menu"]',
          '[class*="avatar"]',
          '[class*="profile"]',
          '[aria-label*="account"]',
          '[data-testid*="user"]',
          '[class*="logged-in"]',
        ];
        for (const sel of userIndicators) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            return "User profile elements detected — sign-in succeeded.";
          }
        }
        return null;
      }

      // Immediate check
      const immediate = checkSuccess();
      if (immediate) { resolve(immediate); return; }

      // Poll + MutationObserver
      const observer = new MutationObserver(() => {
        const result = checkSuccess();
        if (result) {
          observer.disconnect();
          clearInterval(pollInterval);
          resolve(result);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });

      const pollInterval = setInterval(() => {
        const result = checkSuccess();
        if (result) {
          observer.disconnect();
          clearInterval(pollInterval);
          resolve(result);
        }
        if (Date.now() - startTime > timeoutMs) {
          observer.disconnect();
          clearInterval(pollInterval);
          resolve(null); // Timeout — no success detected
        }
      }, 500);
    });
  }

  async function tryDirectPost(oauthConnectionId) {
    const loginUriEl = document.querySelector('[data-login_uri]');
    if (!loginUriEl) return null;

    // Request ID token from background.js
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "FETCH_OAUTH_TOKEN", oauthConnectionId },
        resolve
      );
    });

    if (!response || !response.success || !response.idToken) {
      return null;
    }

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
        logOAuthActivity("oauth_signin_success");
        window.location.reload();
        return "Google Sign-In successful via direct POST. Page is reloading.";
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function logOAuthActivity(action) {
    try {
      chrome.runtime.sendMessage({
        type: "LOG_ACTIVITY",
        action,
        site: window.location.hostname
      });
    } catch (_) {}
  }

  function getCsrfToken() {
    // Try to read g_csrf_token cookie
    const match = document.cookie.match(/g_csrf_token=([^;]+)/);
    return match ? match[1] : "";
  }

  // --- Google Sign-In tool registration ---

  let googleSignInToolRegistered = false;

  function registerGoogleSignInTool() {
    if (googleSignInToolRegistered) return;
    if (typeof navigator.modelContext === "undefined") return;

    googleSignInToolRegistered = true;
    navigator.modelContext.registerTool({
      name: "google_signin",
      description:
        "Sign into this website using Google OAuth via Agent Badge. " +
        "The extension checks for an active Google session and clicks the Sign-In button. " +
        "Tokens never appear in the response.",
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

        // Strategy 1: Click-based with session detection (primary)
        const sessionResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: "CHECK_GOOGLE_SESSION", oauthConnectionId: input.oauthConnectionId },
            resolve
          );
        });

        if (!sessionResult) {
          logOAuthActivity("oauth_signin_failed");
          return { result: "Failed to check Google session status. Extension may not be connected." };
        }

        if (sessionResult.error && !sessionResult.hasSession && sessionResult.hasSession !== null) {
          logOAuthActivity("oauth_signin_failed");
          return { result: `Failed to check Google session: ${sessionResult.error}` };
        }

        // If we know there's no session for the expected email
        if (sessionResult.hasSession === false) {
          const emailInfo = sessionResult.expectedEmail
            ? ` Expected email: ${sessionResult.expectedEmail}.`
            : "";
          const sessionInfo = sessionResult.sessionEmails?.length
            ? ` Currently signed-in accounts: ${sessionResult.sessionEmails.join(", ")}.`
            : " No Google accounts are currently signed in.";
          logOAuthActivity("oauth_signin_failed");
          return {
            result: `Cannot sign in: the required Google account is not signed into this browser.${emailInfo}${sessionInfo} Please sign into Google with the correct account first.`
          };
        }

        // Session exists (true) or unknown (null) — try clicking
        if (clickGoogleSignInButton()) {
          logOAuthActivity("oauth_signin_click");

          // Wait for sign-in to complete
          const successMessage = await waitForSignInSuccess(8000);
          if (successMessage) {
            logOAuthActivity("oauth_signin_success");
            return { result: `Google Sign-In succeeded. ${successMessage}` };
          }

          // Click happened but we couldn't confirm success — it might still be working
          // (e.g. popup opened, redirect in progress)
          return {
            result: "Clicked Google Sign-In button. The OAuth flow may be in progress (popup or redirect). Check if the page state has changed."
          };
        }

        // Strategy 2: Direct POST fallback (for controlled apps like mock CRM)
        const postResult = await tryDirectPost(input.oauthConnectionId);
        if (postResult) {
          return { result: postResult };
        }

        logOAuthActivity("oauth_signin_failed");
        return { result: "Google Sign-In elements detected but could not interact with them automatically." };
      }
    });
  }

  // --- OTP verification tool registration ---

  let otpToolRegistered = false;

  function registerOtpTool() {
    if (otpToolRegistered) return;
    if (typeof navigator.modelContext === "undefined") return;

    otpToolRegistered = true;
    navigator.modelContext.registerTool({
      name: "verify_otp",
      description:
        "Verify OTP/2FA code sent via email. Agent Badge polls the agent's email inbox, " +
        "extracts the code, and fills it into the page. The OTP never appears in the response.",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      },
      execute: async () => {
        if (!hasOtpForm()) {
          return { result: "No OTP input detected on this page." };
        }

        // Ask background.js to fetch the OTP from the backend
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "FETCH_OTP" }, resolve);
        });

        if (!response || !response.success) {
          const reason = response?.error || "Unknown error";
          return { result: `Failed to fetch OTP: ${reason}` };
        }

        // Fill OTP into the form
        const filled = fillOtp(response.otp);
        if (!filled) {
          return { result: "Received OTP but could not find input field to fill it into." };
        }

        // Brief pause for input events to process
        await new Promise((r) => setTimeout(r, 100));

        // Try to submit
        const submitBtn = findOtpSubmitButton();
        if (submitBtn) {
          submitBtn.click();
          return { result: "OTP verified and submitted successfully." };
        }

        const otpResult = findOtpInputs();
        if (otpResult) {
          const form = otpResult.inputs[0].closest("form");
          if (form) {
            form.requestSubmit?.() ?? form.submit();
            return { result: "OTP verified and submitted successfully." };
          }
        }

        return { result: "OTP filled successfully but no submit button found. The agent may need to click submit." };
      }
    });
  }

  // --- Manual test trigger (Ctrl+Shift+L) ---
  document.addEventListener("keydown", async (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === "L") {
      console.log("[Agent Badge] Manual login trigger...");
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "FETCH_CREDENTIALS", site: "crm", url: window.location.origin },
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

    // --- Manual Google Sign-In trigger (Ctrl+Shift+G) ---
    if (e.ctrlKey && e.shiftKey && e.key === "G") {
      console.log("[Agent Badge] Manual Google Sign-In trigger...");
      if (!hasGoogleSignIn()) {
        console.error("[Agent Badge] No Google Sign-In detected on this page.");
        return;
      }

      // Try direct POST first
      const postResult = await tryDirectPost("default");
      if (postResult) {
        console.log("[Agent Badge] Direct POST result:", postResult);
        return;
      }

      // Fall back to clicking the button
      console.log("[Agent Badge] Direct POST not available, clicking button...");
      if (clickGoogleSignInButton()) {
        console.log("[Agent Badge] Clicked Google Sign-In button.");
      } else {
        console.error("[Agent Badge] Could not find Google Sign-In button to click.");
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
  if (hasOtpForm()) {
    registerOtpTool();
  }

  // Also watch for dynamically added login forms, Google Sign-In, and OTP forms (SPAs)
  const observer = new MutationObserver(() => {
    if (hasLoginForm()) registerLoginTool();
    if (hasGoogleSignIn()) registerGoogleSignInTool();
    if (hasOtpForm()) registerOtpTool();
    if (loginToolRegistered && googleSignInToolRegistered && otpToolRegistered) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
