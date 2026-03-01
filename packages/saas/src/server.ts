import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import agentsRoutes, { authRoute } from "./routes/agents";
import credentialsRoutes from "./routes/credentials";
import activityRoutes from "./routes/activity";
import { initDatabase } from "./store";

const app = new Hono();

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://agent-badge.onrender.com",
];

app.use("*", cors({
  origin: (origin) => {
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    if (origin?.startsWith("chrome-extension://")) return origin;
    return null;
  },
  credentials: true
}));

// API routes
app.route("/agents", agentsRoutes);
app.route("/credentials", credentialsRoutes);
app.route("/auth", authRoute);
app.route("/activity", activityRoutes);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Serve static frontend files (Vite build output)
app.use("/*", serveStatic({ root: "./frontend/dist" }));

// SPA fallback — serve index.html for non-API routes
app.get("*", serveStatic({ root: "./frontend/dist", path: "index.html" }));

const port = parseInt(process.env.PORT || "3000", 10);

// Initialize database then start
initDatabase().then(() => {
  console.log(`Agent Badge SaaS running on port ${port}`);
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

export default {
  port,
  fetch: app.fetch,
};
