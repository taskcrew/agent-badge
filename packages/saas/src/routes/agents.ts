import { Hono } from "hono";
import { createAgent, listAgents, findAgentByApiKey } from "../store";

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

// GET /agents - List all agents
app.get("/", async (c) => {
  return c.json(await listAgents());
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
