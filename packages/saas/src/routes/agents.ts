import { Hono } from "hono";
import {
  createAgent,
  listAgents,
  findAgentByApiKey,
  linkAgentCredential,
  unlinkAgentCredential,
  getLinkedCredentials,
  linkAgentOAuth,
  unlinkAgentOAuth,
  getLinkedOAuthConnections,
  getAgentMailbox,
  setAgentMailbox,
  deleteAgentMailbox,
} from "../store";

const app = new Hono();

// POST /agents - Create a new agent
app.post("/", async (c) => {
  const body = await c.req.json();
  const { name } = body;
  if (!name || typeof name !== "string") {
    return c.json({ error: "name is required" }, 400);
  }
  const agent = await createAgent(name);
  return c.json(agent, 201);
});

// GET /agents - List all agents (includes linked credential IDs)
app.get("/", async (c) => {
  const agents = await listAgents();
  const result = await Promise.all(
    agents.map(async (agent) => ({
      ...agent,
      linkedCredentials: await getLinkedCredentials(agent.id),
      linkedOAuthConnections: await getLinkedOAuthConnections(agent.id),
      mailboxAddress: (await getAgentMailbox(agent.id)) || null,
    }))
  );
  return c.json(result);
});

// POST /agents/:id/links - Link agent to a credential
app.post("/:id/links", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json();
  const { credentialId } = body;
  if (!credentialId) {
    return c.json({ error: "credentialId is required" }, 400);
  }
  await linkAgentCredential(agentId, credentialId);
  return c.json({ linked: true }, 201);
});

// DELETE /agents/:id/links/:credentialId - Unlink agent from a credential
app.delete("/:id/links/:credentialId", async (c) => {
  const agentId = c.req.param("id");
  const credentialId = c.req.param("credentialId");
  await unlinkAgentCredential(agentId, credentialId);
  return c.json({ unlinked: true });
});

// POST /agents/:id/oauth-links - Link agent to an OAuth connection
app.post("/:id/oauth-links", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json();
  const { oauthConnectionId, allowedScopes } = body;
  if (!oauthConnectionId) {
    return c.json({ error: "oauthConnectionId is required" }, 400);
  }
  await linkAgentOAuth(agentId, oauthConnectionId, allowedScopes || "openid email profile");
  return c.json({ linked: true }, 201);
});

// DELETE /agents/:id/oauth-links/:oauthConnectionId - Unlink
app.delete("/:id/oauth-links/:oauthConnectionId", async (c) => {
  const agentId = c.req.param("id");
  const oauthConnectionId = c.req.param("oauthConnectionId");
  await unlinkAgentOAuth(agentId, oauthConnectionId);
  return c.json({ unlinked: true });
});

// POST /agents/:id/mailbox - Create a mailbox for an agent (convenience alias)
app.post("/:id/mailbox", async (c) => {
  const agentId = c.req.param("id");
  const existing = await getAgentMailbox(agentId);
  if (existing) {
    return c.json({ inboxAddress: existing });
  }

  const { AgentMailClient } = await import("agentmail");
  const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY || "";
  if (!AGENTMAIL_API_KEY) {
    return c.json({ error: "AGENTMAIL_API_KEY not configured" }, 500);
  }
  const client = new AgentMailClient({ apiKey: AGENTMAIL_API_KEY });
  const inbox = await client.inboxes.create();
  const inboxAddress = `${inbox.inboxId}@agentmail.to`;
  await setAgentMailbox(agentId, inboxAddress);
  return c.json({ inboxAddress }, 201);
});

// DELETE /agents/:id/mailbox - Remove agent's mailbox
app.delete("/:id/mailbox", async (c) => {
  const agentId = c.req.param("id");
  await deleteAgentMailbox(agentId);
  return c.json({ deleted: true });
});

// POST /auth - Validate an agent API key
export const authRoute = new Hono();
authRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { apiKey } = body;
  if (!apiKey) {
    return c.json({ valid: false, error: "apiKey is required" }, 400);
  }
  const agent = await findAgentByApiKey(apiKey);
  if (!agent) {
    return c.json({ valid: false }, 401);
  }
  return c.json({ valid: true, agent: { id: agent.id, name: agent.name } });
});

export default app;
