import index from "../frontend/index.html";
import { BrowserUse } from "browser-use-sdk";

const client = new BrowserUse(); // reads BROWSER_USE_API_KEY from env

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

const server = Bun.serve({
  port: process.env.PORT || 3100,

  routes: {
    "/*": index,

    "/api/execute": {
      async POST(req) {
        const body = await req.json();
        const { prompt } = body;

        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
          return Response.json(
            { error: "Prompt is required" },
            { status: 400 }
          );
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

        // Fire and forget — run the browser agent in the background
        runAgent(session).catch((err) => {
          session.status = "error";
          session.error = err.message ?? String(err);
          session.completedAt = new Date().toISOString();
        });

        return Response.json({ id, status: "running" });
      },
    },

    "/api/sessions/:id": {
      GET(req) {
        const session = sessions.get(req.params.id);
        if (!session) {
          return Response.json({ error: "Session not found" }, { status: 404 });
        }
        return Response.json(session);
      },
    },

    "/api/sessions": {
      GET() {
        const list = Array.from(sessions.values())
          .sort(
            (a, b) =>
              new Date(b.startedAt).getTime() -
              new Date(a.startedAt).getTime()
          )
          .slice(0, 50);
        return Response.json(list);
      },
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

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
