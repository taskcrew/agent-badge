import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { AgentMailClient } from "agentmail";
import postgres from "postgres";

const app = new Hono();

// --- In-memory session store ---
const sessions = new Map<string, { email: string; createdAt: number }>();

// --- In-memory OTP store ---
const pendingOtps = new Map<string, { email: string; otp: string; createdAt: number }>();

// --- Database connection (shared with agent badge saas) ---
const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL
  ? postgres(DATABASE_URL, { ssl: { rejectUnauthorized: false } })
  : null;

async function validatePassword(password: string): Promise<boolean> {
  if (!sql) {
    console.log("[Auth] No DATABASE_URL, using hardcoded password fallback");
    return password === "P@ssw0rd123";
  }
  try {
    // Match by URL (same logic as saas getCredentialByUrl) or by site name
    const rows = await sql`
      SELECT site, url, password FROM credentials
      WHERE url LIKE 'https://agent-badge-crm%'
         OR site = 'NexusCRM'
      LIMIT 1
    `;
    if (rows.length === 0) {
      console.log("[Auth] No NexusCRM credential found in database");
      return false;
    }
    const match = rows[0].password === password;
    console.log(`[Auth] DB credential: site=${rows[0].site} url=${rows[0].url} passwordMatch=${match}`);
    return match;
  } catch (err) {
    console.error("[Auth] Database query failed, falling back to hardcoded password:", err);
    return password === "P@ssw0rd123";
  }
}

// --- AgentMail config for sending OTP emails ---
const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY || "";
const OTP_SENDER_INBOX = process.env.OTP_SENDER_INBOX || ""; // e.g. "nexuscrm-noreply@agentmail.to"

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtpEmail(recipientEmail: string, otp: string): Promise<boolean> {
  if (!AGENTMAIL_API_KEY || !OTP_SENDER_INBOX) {
    console.log(`[OTP] AgentMail not configured. OTP code: ${otp}`);
    return true; // Still allow flow to continue for testing
  }

  try {
    const client = new AgentMailClient({ apiKey: AGENTMAIL_API_KEY });
    const senderInboxId = OTP_SENDER_INBOX.split("@")[0];
    if (!recipientEmail) {
      console.log(`[OTP] No recipient email provided. OTP code: ${otp}`);
      return true;
    }

    await client.inboxes.messages.send(senderInboxId, {
      to: [recipientEmail],
      subject: "Your NexusCRM verification code",
      text: `Your verification code is ${otp}\n\nThis code expires in 5 minutes.\n\n— NexusCRM`,
      html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px;">
        <h2 style="color:#1a1a2e;">Nexus<span style="color:#6c63ff;">CRM</span></h2>
        <p>Your verification code is:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#6c63ff;margin:20px 0;text-align:center;">${otp}</div>
        <p style="color:#64748b;font-size:13px;">This code expires in 5 minutes.</p>
      </div>`,
    });
    console.log(`[OTP] Email sent to ${recipient}`);
    return true;
  } catch (err) {
    console.error(`[OTP] Failed to send email:`, err);
    return false;
  }
}

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
    <div style="text-align:center;margin-top:20px;font-size:13px;color:#64748b;">
      <a href="/login/google" style="color:#6c63ff;text-decoration:none;font-weight:500;">Sign in with Google instead</a>
    </div>
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

  if (await validatePassword(password)) {
    // Generate OTP and store it
    const otpToken = crypto.randomUUID();
    const otp = generateOtp();
    pendingOtps.set(otpToken, { email, otp, createdAt: Date.now() });

    // Send OTP email
    await sendOtpEmail(email, otp);

    // Set a temporary cookie and redirect to verification page
    setCookie(c, "crm_otp_token", otpToken, { path: "/", httpOnly: true, maxAge: 300 });
    return c.redirect("/login/verify");
  }

  return c.redirect("/login?error=1");
});

// --- OTP Verification page ---
app.get("/login/verify", (c) => {
  const otpToken = getCookie(c, "crm_otp_token");
  if (!otpToken || !pendingOtps.has(otpToken)) {
    return c.redirect("/login");
  }

  const error = c.req.query("error");
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verify - NexusCRM</title><style>${css}</style></head>
<body>
<div class="login-container">
  <div class="login-card">
    <div class="brand">
      <h1>Nexus<span>CRM</span></h1>
      <p>Enter verification code</p>
    </div>
    <p style="font-size:13px;color:#64748b;margin-bottom:20px;text-align:center;">
      We sent a 6-digit code to your email address. Enter it below to complete sign-in.
    </p>
    ${error ? '<div class="error-msg">Invalid or expired verification code. Please try again.</div>' : ""}
    <form method="POST" action="/login/verify">
      <div class="form-group">
        <label for="code">Verification code</label>
        <input type="text" id="code" name="code" placeholder="Enter 6-digit code" required autocomplete="one-time-code" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" style="text-align:center;letter-spacing:8px;font-size:20px;font-weight:600;">
      </div>
      <button type="submit" class="btn-primary">Verify</button>
    </form>
    <div style="text-align:center;margin-top:16px;">
      <a href="/login" style="color:#6c63ff;text-decoration:none;font-size:13px;font-weight:500;">Back to login</a>
    </div>
  </div>
</div>
</body>
</html>`);
});

// --- OTP Verification POST ---
app.post("/login/verify", async (c) => {
  const otpToken = getCookie(c, "crm_otp_token");
  if (!otpToken || !pendingOtps.has(otpToken)) {
    return c.redirect("/login");
  }

  const body = await c.req.parseBody();
  const code = (body.code as string || "").trim();
  const pending = pendingOtps.get(otpToken)!;

  // Check expiry (5 minutes)
  if (Date.now() - pending.createdAt > 5 * 60 * 1000) {
    pendingOtps.delete(otpToken);
    deleteCookie(c, "crm_otp_token", { path: "/" });
    return c.redirect("/login?error=1");
  }

  if (code !== pending.otp) {
    return c.redirect("/login/verify?error=1");
  }

  // OTP valid — create session
  pendingOtps.delete(otpToken);
  deleteCookie(c, "crm_otp_token", { path: "/" });

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { email: pending.email, createdAt: Date.now() });
  setCookie(c, "crm_session", sessionId, { path: "/", httpOnly: true, maxAge: 86400 });
  return c.redirect("/contacts");
});

// --- Google Sign-In page ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

app.get("/login/google", (c) => {
  const error = c.req.query("error");
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Google Sign-In - NexusCRM</title>
<script src="https://accounts.google.com/gsi/client" async></script>
<style>${css}
.divider { display: flex; align-items: center; margin: 24px 0; color: #94a3b8; font-size: 13px; }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
.divider span { padding: 0 12px; }
.google-section { text-align: center; }
.alt-login { text-align: center; margin-top: 20px; font-size: 13px; color: #64748b; }
.alt-login a { color: #6c63ff; text-decoration: none; font-weight: 500; }
</style>
</head>
<body>
<div class="login-container">
  <div class="login-card">
    <div class="brand">
      <h1>Nexus<span>CRM</span></h1>
      <p>Sign in with Google</p>
    </div>
    ${error ? '<div class="error-msg">Google Sign-In failed. Please try again.</div>' : ""}
    <div class="google-section">
      <div id="g_id_onload"
        data-client_id="${GOOGLE_CLIENT_ID}"
        data-login_uri="/auth/google/callback"
        data-auto_prompt="false">
      </div>
      <div class="g_id_signin"
        data-type="standard"
        data-size="large"
        data-theme="outline"
        data-text="sign_in_with"
        data-shape="rectangular"
        data-logo_alignment="left"
        data-width="320">
      </div>
    </div>
    <div class="alt-login">
      <a href="/login">Sign in with password instead</a>
    </div>
  </div>
</div>
</body>
</html>`);
});

// --- Google Sign-In callback ---
app.post("/auth/google/callback", async (c) => {
  const body = await c.req.parseBody();
  const credential = body.credential as string;

  if (!credential) {
    return c.redirect("/login/google?error=1");
  }

  // Decode the JWT payload (middle segment) to get email
  // In a real app you'd verify the signature; for a mock CRM we just decode
  try {
    const payload = JSON.parse(atob(credential.split(".")[1]));
    const email = payload.email;

    if (!email) {
      return c.redirect("/login/google?error=1");
    }

    // Accept any Google account for this mock CRM
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { email, createdAt: Date.now() });
    setCookie(c, "crm_session", sessionId, { path: "/", httpOnly: true, maxAge: 86400 });
    return c.redirect("/contacts");
  } catch (_) {
    return c.redirect("/login/google?error=1");
  }
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
  const sessionId = getCookie(c, "crm_session");
  const sessionEmail = sessions.get(sessionId!)?.email || "unknown";
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
    <span class="user-badge">${sessionEmail}</span>
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
