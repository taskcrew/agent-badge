import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { serveStatic } from "hono/bun";
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
  liveUrl?: string;
  startedAt: string;
  completedAt?: string;
}

const sessions = new Map<string, RunSession>();

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// ---------- Hono app ----------

const app = new Hono();

app.use("*", basicAuth({ username: DASHBOARD_USER, password: DASHBOARD_PASS }));

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

// Serve static frontend files (bun build output)
app.use("/*", serveStatic({ root: "./frontend/dist" }));

// SPA fallback — serve index.html for non-API routes
app.get("*", serveStatic({ root: "./frontend/dist", path: "index.html" }));

// ---------- server ----------

const port = parseInt(process.env.PORT || "3100", 10);

export default {
  port,
  fetch: app.fetch,
};

// ---------- agent runner ----------

async function runAgent(session: RunSession) {
  session.logs.push("Initializing browser agent...");

  try {
    const run = client.run(session.prompt);

    // Resolve the live URL once the task is created
    resolveAndSetLiveUrl(run, session);

    for await (const step of run) {
      session.logs.push(`[Step ${step.number}] ${step.nextGoal ?? ""}`);
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

async function resolveAndSetLiveUrl(run: ReturnType<typeof client.run>, session: RunSession) {
  try {
    // Wait for the task to be created so we have a taskId
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (run.taskId) { clearInterval(check); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(check); resolve(); }, 10_000);
    });

    if (!run.taskId) return;

    const task = await client.tasks.get(run.taskId);
    const browserSession = await client.sessions.get(task.sessionId);
    if (browserSession.liveUrl) {
      session.liveUrl = browserSession.liveUrl;
      session.logs.push(`Live view available`);
    }
  } catch {
    // non-critical — live URL is best-effort
  }
}

console.log(`Runner listening on port ${port}`);
