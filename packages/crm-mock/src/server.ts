import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

const app = new Hono();

// --- In-memory session store ---
const sessions = new Map<string, { email: string; createdAt: number }>();

// --- Demo credentials ---
const VALID_EMAIL = "admin@company.com";
const VALID_PASSWORD = "P@ssw0rd123";

// --- Pre-seeded contacts ---
const contacts = [
  { id: 1, name: "John Smith", email: "john.smith@acme.com", phone: "555-0123", company: "Acme Corp", role: "VP of Sales", status: "Active" },
  { id: 2, name: "Alice Jones", email: "alice.jones@globex.com", phone: "555-0456", company: "Globex Inc", role: "CTO", status: "Active" },
  { id: 3, name: "Bob Williams", email: "bob.w@initech.com", phone: "555-0789", company: "Initech", role: "Product Manager", status: "Active" },
  { id: 4, name: "Carol Davis", email: "carol.d@hooli.com", phone: "555-0234", company: "Hooli", role: "Engineering Lead", status: "Inactive" },
  { id: 5, name: "Dave Wilson", email: "dave.wilson@pied.com", phone: "555-0567", company: "Pied Piper", role: "CEO", status: "Active" },
  { id: 6, name: "Eve Martinez", email: "eve.m@umbrella.com", phone: "555-0890", company: "Umbrella Corp", role: "Director of Ops", status: "Active" },
  { id: 7, name: "Frank Brown", email: "frank.b@wayne.com", phone: "555-0345", company: "Wayne Enterprises", role: "CFO", status: "Active" },
  { id: 8, name: "Grace Lee", email: "grace.lee@stark.com", phone: "555-0678", company: "Stark Industries", role: "Head of R&D", status: "Inactive" },
];

// --- Auth middleware ---
function requireAuth(c: any, next: () => Promise<void>) {
  const sessionId = getCookie(c, "crm_session");
  if (!sessionId || !sessions.has(sessionId)) {
    return c.redirect("/login");
  }
  return next();
}

// --- Shared styles ---
const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #1a1a2e; }

  .navbar { background: #1a1a2e; padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; }
  .navbar .logo { color: #fff; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .navbar .logo span { color: #6c63ff; }
  .navbar .nav-right { display: flex; align-items: center; gap: 16px; }
  .navbar .nav-right a { color: #94a3b8; text-decoration: none; font-size: 14px; }
  .navbar .nav-right a:hover { color: #fff; }
  .navbar .user-badge { background: #6c63ff; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 500; }

  .login-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
  .login-card { background: #fff; border-radius: 12px; padding: 40px; width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
  .login-card .brand { text-align: center; margin-bottom: 32px; }
  .login-card .brand h1 { font-size: 24px; color: #1a1a2e; }
  .login-card .brand h1 span { color: #6c63ff; }
  .login-card .brand p { color: #64748b; font-size: 14px; margin-top: 4px; }

  .form-group { margin-bottom: 20px; }
  .form-group label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
  .form-group input { width: 100%; padding: 10px 14px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; }
  .form-group input:focus { outline: none; border-color: #6c63ff; box-shadow: 0 0 0 3px rgba(108,99,255,0.1); }

  .btn-primary { width: 100%; padding: 11px; background: #6c63ff; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
  .btn-primary:hover { background: #5a52e0; }

  .error-msg { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; border: 1px solid #fecaca; }

  .page-container { max-width: 1100px; margin: 0 auto; padding: 24px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .page-header h2 { font-size: 22px; font-weight: 700; }

  .search-bar { position: relative; }
  .search-bar input { padding: 9px 14px 9px 36px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; width: 280px; background: #fff; }
  .search-bar input:focus { outline: none; border-color: #6c63ff; }
  .search-bar svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; }

  .contacts-table { width: 100%; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .contacts-table table { width: 100%; border-collapse: collapse; }
  .contacts-table th { text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .contacts-table td { padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
  .contacts-table tr:last-child td { border-bottom: none; }
  .contacts-table tr:hover td { background: #f8fafc; }

  .status { padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
  .status.active { background: #dcfce7; color: #16a34a; }
  .status.inactive { background: #f1f5f9; color: #64748b; }

  .stats-row { display: flex; gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #fff; border-radius: 10px; padding: 18px 20px; flex: 1; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .stat-card .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .stat-card .stat-value { font-size: 28px; font-weight: 700; margin-top: 4px; color: #1a1a2e; }
`;

// --- Login page ---
app.get("/login", (c) => {
  const error = c.req.query("error");
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Login - NexusCRM</title><style>${css}</style></head>
<body>
<div class="login-container">
  <div class="login-card">
    <div class="brand">
      <h1>Nexus<span>CRM</span></h1>
      <p>Sign in to your account</p>
    </div>
    ${error ? '<div class="error-msg">Invalid email or password. Please try again.</div>' : ""}
    <form method="POST" action="/login">
      <div class="form-group">
        <label for="email">Email address</label>
        <input type="email" id="email" name="email" placeholder="you@company.com" required autocomplete="username">
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Enter your password" required autocomplete="current-password">
      </div>
      <button type="submit" class="btn-primary">Sign in</button>
    </form>
  </div>
</div>
</body>
</html>`);
});

// --- Login POST ---
app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = body.email as string;
  const password = body.password as string;

  if (email === VALID_EMAIL && password === VALID_PASSWORD) {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { email, createdAt: Date.now() });
    setCookie(c, "crm_session", sessionId, { path: "/", httpOnly: true, maxAge: 86400 });
    return c.redirect("/contacts");
  }

  return c.redirect("/login?error=1");
});

// --- Logout ---
app.get("/logout", (c) => {
  const sessionId = getCookie(c, "crm_session");
  if (sessionId) sessions.delete(sessionId);
  deleteCookie(c, "crm_session", { path: "/" });
  return c.redirect("/login");
});

// --- Root redirect ---
app.get("/", (c) => c.redirect("/login"));

// --- Contacts page ---
app.get("/contacts", async (c, next) => {
  const sessionId = getCookie(c, "crm_session");
  if (!sessionId || !sessions.has(sessionId)) return c.redirect("/login");
  await next();
}, (c) => {
  const search = (c.req.query("q") || "").toLowerCase();
  const filtered = search
    ? contacts.filter((ct) => ct.name.toLowerCase().includes(search) || ct.email.toLowerCase().includes(search) || ct.company.toLowerCase().includes(search))
    : contacts;

  const activeCount = contacts.filter((ct) => ct.status === "Active").length;

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Contacts - NexusCRM</title><style>${css}</style></head>
<body>
<nav class="navbar">
  <div class="logo">Nexus<span>CRM</span></div>
  <div class="nav-right">
    <a href="/contacts">Contacts</a>
    <span class="user-badge">admin@company.com</span>
    <a href="/logout">Sign out</a>
  </div>
</nav>
<div class="page-container">
  <div class="stats-row">
    <div class="stat-card"><div class="stat-label">Total Contacts</div><div class="stat-value">${contacts.length}</div></div>
    <div class="stat-card"><div class="stat-label">Active</div><div class="stat-value">${activeCount}</div></div>
    <div class="stat-card"><div class="stat-label">Companies</div><div class="stat-value">${new Set(contacts.map((c) => c.company)).size}</div></div>
  </div>
  <div class="page-header">
    <h2>Contacts</h2>
    <div class="search-bar">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <form method="GET" action="/contacts" style="display:inline">
        <input type="text" name="q" placeholder="Search contacts..." value="${search}">
      </form>
    </div>
  </div>
  <div class="contacts-table">
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Role</th><th>Status</th></tr></thead>
      <tbody>
        ${filtered.map((ct) => `<tr>
          <td><strong>${ct.name}</strong></td>
          <td>${ct.email}</td>
          <td>${ct.phone}</td>
          <td>${ct.company}</td>
          <td>${ct.role}</td>
          <td><span class="status ${ct.status.toLowerCase()}">${ct.status}</span></td>
        </tr>`).join("")}
        ${filtered.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:#64748b;">No contacts found</td></tr>' : ""}
      </tbody>
    </table>
  </div>
</div>
</body>
</html>`);
});

// --- Contact detail (JSON, for agent use) ---
app.get("/contacts/:id", async (c, next) => {
  const sessionId = getCookie(c, "crm_session");
  if (!sessionId || !sessions.has(sessionId)) return c.json({ error: "Unauthorized" }, 401);
  await next();
}, (c) => {
  const id = parseInt(c.req.param("id"));
  const contact = contacts.find((ct) => ct.id === id);
  if (!contact) return c.json({ error: "Contact not found" }, 404);
  return c.json(contact);
});

// --- Start server ---
const port = parseInt(process.env.PORT || "4000", 10);
console.log(`NexusCRM running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
