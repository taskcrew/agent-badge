/**
 * OLD WAY: Credentials exposed in the agent's LLM context
 *
 * This script demonstrates the insecure approach where the AI agent
 * receives raw credentials in its system prompt. The LLM sees the
 * email and password as plain text, creating security risks:
 *
 * - Credentials are visible in the LLM's context window
 * - Credentials could leak via prompt injection attacks
 * - Credentials appear in agent transcripts and logs
 * - No audit trail of credential usage
 * - No centralized credential management
 */

import { Agent } from "browser-use";

const SYSTEM_PROMPT = `You are a helpful assistant that can browse the web.

TASK: Log into the CRM app and find John Smith's phone number.

CRM Login URL: http://localhost:4000/login

CRM Credentials:
  Email: admin@company.com
  Password: P@ssw0rd123

Instructions:
1. Navigate to http://localhost:4000/login
2. Fill in the email field with "admin@company.com"
3. Fill in the password field with "P@ssw0rd123"
4. Click the "Sign in" button
5. Once logged in, search for "John Smith"
6. Report back John Smith's phone number`;

// ⚠️  SECURITY ISSUES WITH THIS APPROACH:
//
// 1. Credentials are embedded in the system prompt — the LLM sees them
// 2. The agent types credentials character by character, visible in transcripts
// 3. A prompt injection on any visited page could extract the credentials
// 4. No way to rotate credentials without changing the agent script
// 5. No audit log of when/where credentials were used
// 6. If the agent is compromised, all embedded credentials are exposed

async function main() {
  console.log("=== OLD WAY: Credentials in System Prompt ===\n");
  console.log("WARNING: The agent's LLM can see these credentials:");
  console.log("  Email:    admin@company.com");
  console.log("  Password: P@ssw0rd123");
  console.log("");

  const agent = new Agent({
    task: SYSTEM_PROMPT,
    // The agent controls Chrome and types the credentials directly.
    // Every keystroke is visible in the LLM transcript.
  });

  // Expected agent transcript (credentials fully visible):
  //
  // > Navigating to http://localhost:4000/login
  // > I can see a login form. I'll enter the credentials.
  // > Filling email field with "admin@company.com"
  // > Filling password field with "P@ssw0rd123"     <-- ⚠️ VISIBLE
  // > Clicking "Sign in" button
  // > Successfully logged in. I can see the contacts page.
  // > Searching for "John Smith"...
  // > Found John Smith. His phone number is 555-0123.

  console.log("Agent would execute the task with credentials visible in context...\n");
  console.log("Simulated result: John Smith's phone number is 555-0123");
  console.log("\n⚠️  The credentials were exposed throughout the entire session.");
}

main().catch(console.error);
