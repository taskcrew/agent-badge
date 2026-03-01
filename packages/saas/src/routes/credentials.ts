import { Hono } from "hono";
import {
  storeCredential,
  listCredentials,
  getCredentialByUrl,
  getCredentialBySite,
  findAgentByApiKey,
  logActivity,
  isAgentLinkedToUrl,
  isAgentLinkedToSite,
  updateCredential,
  deleteCredential,
  getAgentMailbox,
} from "../store";

const app = new Hono();

// POST /credentials - Store credentials for a site
app.post("/", async (c) => {
  const body = await c.req.json();
  const { site, url, email, password, useAgentEmail } = body;
  if (!site || !url || !email || !password) {
    return c.json({ error: "site, url, email, and password are required" }, 400);
  }
  const cred = await storeCredential(site, url, email, password, useAgentEmail ?? false);
  return c.json({ id: cred.id, site: cred.site, url: cred.url, email: cred.email, useAgentEmail: cred.useAgentEmail, createdAt: cred.createdAt }, 201);
});

// GET /credentials - List stored credentials (passwords redacted)
app.get("/", async (c) => {
  return c.json(await listCredentials());
});

// PATCH /credentials/:id - Update a credential (only if no X-Agent-Key header)
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { site, url, email, password, useAgentEmail } = body;
  if (!site && !url && !email && !password && useAgentEmail === undefined) {
    return c.json({ error: "At least one field is required" }, 400);
  }
  try {
    const cred = await updateCredential(id, { site, url, email, password, useAgentEmail });
    return c.json({ id: cred.id, site: cred.site, url: cred.url, email: cred.email, useAgentEmail: cred.useAgentEmail, createdAt: cred.createdAt });
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

// GET /credentials/by-url/* - Fetch credentials by URL (requires API key + linking)
app.get("/by-url/*", async (c) => {
  const apiKey = c.req.header("X-Agent-Key");
  if (!apiKey) {
    return c.json({ error: "X-Agent-Key header is required" }, 401);
  }

  const agent = await findAgentByApiKey(apiKey);
  if (!agent) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  const url = decodeURIComponent(c.req.path.replace("/credentials/by-url/", ""));

  const linked = await isAgentLinkedToUrl(agent.id, url);
  if (!linked) {
    await logActivity(agent.id, agent.name, "credential_access_denied", url);
    return c.json({ error: "Agent is not authorized for this URL" }, 403);
  }

  const cred = await getCredentialByUrl(url);
  if (!cred) {
    return c.json({ error: "No credentials found for this URL" }, 404);
  }

  await logActivity(agent.id, agent.name, "credential_access", url);

  let responseEmail = cred.email;
  if (cred.useAgentEmail) {
    const mailbox = await getAgentMailbox(agent.id);
    if (mailbox) responseEmail = mailbox;
  }

  return c.json({ site: cred.site, url: cred.url, email: responseEmail, password: cred.password });
});

// GET /credentials/:site - Fetch credentials by site label (legacy, for Chrome extension)
// Uses X-Agent-Key header to distinguish from PATCH/DELETE which use :id
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

  const linked = await isAgentLinkedToSite(agent.id, site);
  if (!linked) {
    await logActivity(agent.id, agent.name, "credential_access_denied", site);
    return c.json({ error: "Agent is not authorized for this site" }, 403);
  }

  const cred = await getCredentialBySite(site);
  if (!cred) {
    return c.json({ error: "No credentials found for this site" }, 404);
  }

  await logActivity(agent.id, agent.name, "credential_access", site);

  let siteResponseEmail = cred.email;
  if (cred.useAgentEmail) {
    const mailbox = await getAgentMailbox(agent.id);
    if (mailbox) siteResponseEmail = mailbox;
  }

  return c.json({ site: cred.site, url: cred.url, email: siteResponseEmail, password: cred.password });
});

export default app;
