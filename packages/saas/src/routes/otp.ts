import { Hono } from "hono";
import { AgentMailClient } from "agentmail";
import {
  findAgentByApiKey,
  setAgentMailbox,
  getAgentMailbox,
  deleteAgentMailbox,
  logActivity,
} from "../store";
import { extractOtp } from "../otp-utils";

const app = new Hono();

const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY || "";

function getMailClient() {
  if (!AGENTMAIL_API_KEY) {
    throw new Error("AGENTMAIL_API_KEY environment variable is not configured");
  }
  return new AgentMailClient({ apiKey: AGENTMAIL_API_KEY });
}

// POST /otp/mailbox — Create an AgentMail inbox for an agent
app.post("/mailbox", async (c) => {
  const body = await c.req.json();
  const { agentId } = body as { agentId: string };

  if (!agentId) {
    return c.json({ error: "agentId is required" }, 400);
  }

  // Check if agent already has a mailbox
  const existing = await getAgentMailbox(agentId);
  if (existing) {
    return c.json({ inboxAddress: existing });
  }

  const client = getMailClient();
  const inbox = await client.inboxes.create();
  const inboxAddress = inbox.inboxId;
  await setAgentMailbox(agentId, inboxAddress);

  return c.json({ inboxAddress }, 201);
});

// GET /otp/mailbox/:agentId — Get agent's mailbox address
app.get("/mailbox/:agentId", async (c) => {
  const agentId = c.req.param("agentId");
  const address = await getAgentMailbox(agentId);
  if (!address) {
    return c.json({ error: "No mailbox found for this agent" }, 404);
  }
  return c.json({ inboxAddress: address });
});

// DELETE /otp/mailbox/:agentId — Remove mailbox assignment
app.delete("/mailbox/:agentId", async (c) => {
  const agentId = c.req.param("agentId");
  await deleteAgentMailbox(agentId);
  return c.json({ deleted: true });
});

// POST /otp/fetch — Poll for OTP code (called by extension)
app.post("/fetch", async (c) => {
  const apiKey = c.req.header("X-Agent-Key");
  if (!apiKey) {
    return c.json({ error: "X-Agent-Key header is required" }, 401);
  }

  const agent = await findAgentByApiKey(apiKey);
  if (!agent) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  const inboxAddress = await getAgentMailbox(agent.id);
  if (!inboxAddress) {
    await logActivity(agent.id, agent.name, "otp_fetch_failed", "email", { detail: "No mailbox configured" });
    return c.json({ success: false, error: "No mailbox configured for this agent. Create one via POST /otp/mailbox first." }, 400);
  }

  const client = getMailClient();

  const inboxId = inboxAddress;

  try {
    // List recent messages from the inbox
    const listResponse = await client.inboxes.messages.list(inboxId);

    if (!listResponse.messages || listResponse.messages.length === 0) {
      await logActivity(agent.id, agent.name, "otp_fetch_failed", "email", { detail: "No messages in inbox" });
      return c.json({ success: false, error: "No OTP email found" });
    }

    // Sort newest-first so we always check the latest OTP email
    const sorted = [...listResponse.messages].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Only consider messages from the last 2 minutes to avoid stale codes
    const twoMinAgo = Date.now() - 2 * 60 * 1000;

    for (const msgItem of sorted) {
      const msgTime = new Date(msgItem.timestamp).getTime();
      if (msgTime < twoMinAgo) continue;

      // First check subject and preview from list response
      const quickTexts = [msgItem.subject || "", msgItem.preview || ""];
      for (const text of quickTexts) {
        const otp = extractOtp(text);
        if (otp) {
          await logActivity(agent.id, agent.name, "otp_fetched", "email");
          return c.json({ success: true, otp });
        }
      }

      // Fetch full message for body content
      const fullMsg = await client.inboxes.messages.get(inboxId, msgItem.messageId);
      const bodyTexts = [fullMsg.text || "", fullMsg.html || ""];
      for (const text of bodyTexts) {
        const otp = extractOtp(text);
        if (otp) {
          await logActivity(agent.id, agent.name, "otp_fetched", "email");
          return c.json({ success: true, otp });
        }
      }
    }

    await logActivity(agent.id, agent.name, "otp_fetch_failed", "email", { detail: "No OTP found in recent messages" });
    return c.json({ success: false, error: "No OTP email found" });
  } catch (err: unknown) {
    const errDetail = err instanceof Error ? err.message : String(err);
    console.error(`[otp/fetch] AgentMail error for inbox ${inboxId}:`, err);
    await logActivity(agent.id, agent.name, "otp_fetch_failed", "email", { detail: errDetail });
    return c.json({ success: false, error: `Failed to fetch messages: ${errDetail}` }, 502);
  }
});

export default app;
