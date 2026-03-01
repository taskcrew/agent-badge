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
  console.log(`[POST /api/execute] prompt="${prompt}"`);

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    console.warn(`[POST /api/execute] rejected — empty prompt`);
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
  console.log(`[POST /api/execute] session ${id} created`);

  runAgent(session).catch((err) => {
    console.error(`[runAgent] session ${id} unhandled error:`, err);
    session.status = "error";
    session.error = err.message ?? String(err);
    session.completedAt = new Date().toISOString();
  });

  return c.json({ id, status: "running" });
});

app.get("/api/sessions/:id", (c) => {
  const id = c.req.param("id");
  const session = sessions.get(id);
  if (!session) {
    console.warn(`[GET /api/sessions/${id}] not found`);
    return c.json({ error: "Session not found" }, 404);
  }
  console.log(`[GET /api/sessions/${id}] status=${session.status}`);
  return c.json(session);
});

app.get("/api/sessions", (c) => {
  console.log(`[GET /api/sessions] total=${sessions.size}`);
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
  console.log(`[runAgent] session ${session.id} starting — prompt="${session.prompt}"`);
  session.logs.push("Initializing browser agent...");

  try {
    // Create the task explicitly so we can grab sessionId + liveUrl before iterating
    const created = await client.tasks.create({ task: session.prompt });
    console.log(`[runAgent] session ${session.id} — taskId=${created.id}, sessionId=${created.sessionId}`);

    // Fetch liveUrl from the session (browser may need a few seconds to spin up)
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        const browserSession = await client.sessions.get(created.sessionId);
        if (browserSession.liveUrl) {
          session.liveUrl = browserSession.liveUrl;
          session.logs.push(`Live view: ${browserSession.liveUrl}`);
          console.log(`[runAgent] session ${session.id} — liveUrl=${browserSession.liveUrl}`);
          break;
        }
        console.log(`[runAgent] session ${session.id} — liveUrl not ready yet (attempt ${attempt + 1}/10)`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!session.liveUrl) {
        console.warn(`[runAgent] session ${session.id} — liveUrl never became available`);
      }
    } catch (err) {
      console.warn(`[runAgent] session ${session.id} — failed to fetch liveUrl:`, err);
    }

    // Now poll for steps until completion
    let lastStepCount = 0;
    let task = await client.tasks.get(created.id);

    while (task.status === "created" || task.status === "started") {
      if (task.steps && task.steps.length > lastStepCount) {
        for (let i = lastStepCount; i < task.steps.length; i++) {
          const step = task.steps[i];
          const msg = `[Step ${step.number}] ${step.nextGoal ?? ""}`;
          console.log(`[runAgent] session ${session.id} ${msg}`);
          session.logs.push(msg);
        }
        lastStepCount = task.steps.length;
      }
      await new Promise((r) => setTimeout(r, 2000));
      task = await client.tasks.get(created.id);
    }

    // Process any remaining steps
    if (task.steps && task.steps.length > lastStepCount) {
      for (let i = lastStepCount; i < task.steps.length; i++) {
        const step = task.steps[i];
        const msg = `[Step ${step.number}] ${step.nextGoal ?? ""}`;
        console.log(`[runAgent] session ${session.id} ${msg}`);
        session.logs.push(msg);
      }
    }

    session.status = task.isSuccess ? "completed" : "error";
    session.result = task.output ?? "";
    if (!task.isSuccess) session.error = task.output ?? "Task failed";
    session.logs.push(task.isSuccess ? "Task completed successfully." : "Task failed.");
    session.completedAt = new Date().toISOString();
    console.log(`[runAgent] session ${session.id} ${session.status}`);
  } catch (err: any) {
    session.status = "error";
    session.error = err.message ?? String(err);
    session.logs.push(`Error: ${session.error}`);
    session.completedAt = new Date().toISOString();
    console.error(`[runAgent] session ${session.id} failed:`, err);
  }
}

console.log(`Runner listening on port ${port}`);
