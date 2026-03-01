import { Hono } from "hono";
import {
  storeCredential,
  listCredentials,
  getCredentialBySite,
  findAgentByApiKey,
  logActivity,
  isAgentLinkedToSite,
  updateCredential,
  deleteCredential,
} from "../store";

const app = new Hono();

// POST /credentials - Store credentials for a site
app.post("/", async (c) => {
  const body = await c.req.json();
  const { site, email, password } = body;
  if (!site || !email || !password) {
    return c.json({ error: "site, email, and password are required" }, 400);
  }
  const cred = await storeCredential(site, email, password);
  return c.json({ id: cred.id, site: cred.site, email: cred.email, createdAt: cred.createdAt }, 201);
});

// GET /credentials - List stored credentials (passwords redacted)
app.get("/", async (c) => {
  return c.json(await listCredentials());
});

// PATCH /credentials/:id - Update a credential
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { site, email, password } = body;
  if (!site && !email && !password) {
    return c.json({ error: "At least one field (site, email, password) is required" }, 400);
  }
  try {
    const cred = await updateCredential(id, { site, email, password });
    return c.json({ id: cred.id, site: cred.site, email: cred.email, createdAt: cred.createdAt });
  } catch {
    return c.json({ error: "Credential not found" }, 404);
  }
});

// DELETE /credentials/:id - Delete a credential
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await deleteCredential(id);
  return c.json({ deleted: true });
});

// GET /credentials/:site - Fetch credentials for a site (requires API key + linking)
// Note: this must come after /:id routes since Hono matches in order,
// but the agent endpoint uses X-Agent-Key header to distinguish
app.get("/:site", async (c) => {
  const apiKey = c.req.header("X-Agent-Key");
  if (!apiKey) {
    return c.json({ error: "X-Agent-Key header is required" }, 401);
  }

  const agent = await findAgentByApiKey(apiKey);
  if (!agent) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  const site = c.req.param("site");

  // Check if agent is linked to this credential
  const linked = await isAgentLinkedToSite(agent.id, site);
  if (!linked) {
    await logActivity(agent.id, agent.name, "credential_access_denied", site);
    return c.json({ error: "Agent is not authorized for this site" }, 403);
  }

  const cred = await getCredentialBySite(site);
  if (!cred) {
    return c.json({ error: "No credentials found for this site" }, 404);
  }

  // Log the access
  await logActivity(agent.id, agent.name, "credential_access", site);

  return c.json({ site: cred.site, email: cred.email, password: cred.password });
});

export default app;
