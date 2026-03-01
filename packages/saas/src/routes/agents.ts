import { Hono } from "hono";
import {
  createAgent,
  listAgents,
  findAgentByApiKey,
  linkAgentCredential,
  unlinkAgentCredential,
  getLinkedCredentials,
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
