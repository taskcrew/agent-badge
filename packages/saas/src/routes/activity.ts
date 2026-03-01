import { Hono } from "hono";
import { listActivity, logActivity, findAgentByApiKey } from "../store";

const app = new Hono();

// GET /activity - Get activity log
app.get("/", async (c) => {
  return c.json(await listActivity());
});

// POST /activity - Log a credential access event
app.post("/", async (c) => {
  const body = await c.req.json();
  const { agentApiKey, action, site } = body;

  if (!agentApiKey || !action || !site) {
    return c.json({ error: "agentApiKey, action, and site are required" }, 400);
  }

  const agent = await findAgentByApiKey(agentApiKey);
  if (!agent) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  const entry = await logActivity(agent.id, agent.name, action, site);
  return c.json(entry, 201);
});

export default app;
