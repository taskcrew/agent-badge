/**
 * BADGE WAY: Credentials never enter the agent's LLM context
 *
 * This script demonstrates the secure Agent Badge approach. The agent
 * only has an API key — no passwords. When it encounters a login page,
 * it discovers a WebMCP `login_to()` tool provided by the Agent Badge
 * Chrome extension. The extension handles authentication by:
 *
 * 1. Fetching credentials from the Agent Badge vault (via API)
 * 2. Filling the form fields via direct DOM manipulation
 * 3. Submitting the form
 * 4. Returning only success/failure to the agent
 *
 * The LLM never sees any credentials. All access is logged.
 */

import { Agent } from "browser-use";

const AGENT_BADGE_API_KEY = "ab_key_xK9mQ2vL8nP4wR7tY1uZ";

const SYSTEM_PROMPT = `You are a helpful assistant that can browse the web.

TASK: Log into the CRM app and find John Smith's phone number.

CRM Login URL: http://localhost:4000/login

Authentication: You have an Agent Badge API key. When you encounter a login page,
look for the login_to() WebMCP tool — it will handle authentication securely
without you needing any credentials.

Agent Badge API Key: ${AGENT_BADGE_API_KEY}

Instructions:
1. Navigate to http://localhost:4000/login
2. Look for available WebMCP tools on the page
3. Use the login_to() tool with site="crm" to authenticate
4. Once logged in, search for "John Smith"
5. Report back John Smith's phone number`;

// ✅ SECURITY BENEFITS OF THIS APPROACH:
//
// 1. No credentials in the system prompt — only an API key
// 2. The login_to() tool is injected by the Chrome extension via WebMCP
// 3. The extension fills form fields via DOM — the LLM never sees values
// 4. The return value is only { success: true } — no credential leakage
// 5. All credential access is logged to the Agent Badge dashboard
// 6. Credentials can be rotated in the vault without touching agent code
// 7. Permissions can be revoked per-agent from the dashboard

async function main() {
  console.log("=== BADGE WAY: Credentials Never in LLM Context ===\n");
  console.log("The agent only has an API key: ab_key_xK9mQ2...");
  console.log("No passwords are present anywhere in the agent's prompt.\n");

  const agent = new Agent({
    task: SYSTEM_PROMPT,
    // Chrome is launched with the Agent Badge extension installed.
    // The extension is configured with the agent's API key.
    // When the agent navigates to a login page, the extension:
    //   1. Detects the login form (input[type=password])
    //   2. Registers a WebMCP login_to() tool via navigator.modelContext
    //   3. The agent discovers and calls login_to({ site: "crm" })
    //   4. The extension fetches credentials from the vault API
    //   5. Fills the form via DOM manipulation
    //   6. Submits the form
    //   7. Returns { success: true } to the agent
  });

  // Expected agent transcript (no credentials visible):
  //
  // > Navigating to http://localhost:4000/login
  // > I can see a login form. Let me check for available WebMCP tools.
  // > Found tool: login_to() - "Log into this site using Agent Badge vault"
  // > Calling login_to({ site: "crm" })
  // > Result: { success: true, message: "Logged in successfully" }
  // > I'm now on the contacts page.
  // > Searching for "John Smith"...
  // > Found John Smith. His phone number is 555-0123.
  //
  // ✅ No credentials appeared in the transcript!

  console.log("Agent would execute the task using login_to() WebMCP tool...\n");
  console.log("Simulated result: John Smith's phone number is 555-0123");
  console.log("\n✅ Credentials were NEVER visible to the agent's LLM.");
  console.log("✅ Agent Badge dashboard logged: 'Agent ab_key_xK9 accessed CRM credentials at " + new Date().toISOString() + "'");
}

main().catch(console.error);
