import index from "../frontend/index.html";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { BrowserUse } from "browser-use-sdk";

const DASHBOARD_USER = process.env.DASHBOARD_USER || "admin";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS;

if (!DASHBOARD_PASS) {
  console.error("DASHBOARD_PASS env var is required");
  process.exit(1);
}

const client = new BrowserUse(); // reads BROWSER_USE_API_KEY from env

// ---------- types ----------

interface RunSession {
  id: string;
  prompt: string;
  status: "running" | "completed" | "error";
  logs: string[];
  result?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

const sessions = new Map<string, RunSession>();

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// ---------- Hono app ----------

const app = new Hono();

const auth = basicAuth({ username: DASHBOARD_USER, password: DASHBOARD_PASS });

// Auth on everything except bundled assets (hashed filenames under /_bun/)
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/_bun/")) return next();
  return auth(c, next);
});

app.post("/api/execute", async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return c.json({ error: "Prompt is required" }, 400);
  }

  const id = generateId();
  const session: RunSession = {
    id,
    prompt: prompt.trim(),
    status: "running",
    logs: [],
    startedAt: new Date().toISOString(),
  };

  sessions.set(id, session);

  runAgent(session).catch((err) => {
    session.status = "error";
    session.error = err.message ?? String(err);
    session.completedAt = new Date().toISOString();
  });

  return c.json({ id, status: "running" });
});

app.get("/api/sessions/:id", (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

app.get("/api/sessions", (c) => {
  const list = Array.from(sessions.values())
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    .slice(0, 50);
  return c.json(list);
});

// SPA fallback — serve the bundled HTML for any non-API route
app.get("*", async (c) => {
  return new Response(Bun.file(index.index), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

// ---------- Bun server ----------

const server = Bun.serve({
  port: process.env.PORT || 3100,

  // HTML import registers the frontend bundle so /_bun/* assets are served
  routes: {
    "/_bun/*": index,
  },

  // Hono handles everything else (with basic auth)
  fetch: app.fetch,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

// ---------- agent runner ----------

async function runAgent(session: RunSession) {
  session.logs.push("Initializing browser agent...");

  try {
    const run = client.run(session.prompt);

    for await (const step of run) {
      session.logs.push(`[Step ${step.stepNumber}] ${step.nextGoal ?? ""}`);
    }

    const result = run.result!;
    session.status = "completed";
    session.result = result.output ?? "";
    session.logs.push("Task completed successfully.");
    session.completedAt = new Date().toISOString();
  } catch (err: any) {
    session.status = "error";
    session.error = err.message ?? String(err);
    session.logs.push(`Error: ${session.error}`);
    session.completedAt = new Date().toISOString();
  }
}

console.log(`Runner listening on http://localhost:${server.port}`);
