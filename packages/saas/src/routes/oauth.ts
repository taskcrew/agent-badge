import { Hono } from "hono";
import { encrypt, decrypt } from "../crypto";
import {
  createOAuthConnection,
  listOAuthConnections,
  getOAuthConnection,
  updateOAuthConnection,
  deleteOAuthConnection,
  findAgentByApiKey,
  getAgentOAuthLink,
  logActivity,
} from "../store";

const app = new Hono();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth/google/callback";

// In-memory CSRF nonce store (state → timestamp). Nonces expire after 10 minutes.
const csrfNonces = new Map<string, number>();

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function cleanExpiredNonces() {
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  for (const [nonce, ts] of csrfNonces) {
    if (ts < tenMinAgo) csrfNonces.delete(nonce);
  }
}

// GET /oauth/google/authorize — Returns Google consent URL
app.get("/google/authorize", (c) => {
  cleanExpiredNonces();
  const state = generateNonce();
  csrfNonces.set(state, Date.now());

  const scopes = "openid email profile";
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return c.redirect(url);
});

// GET /oauth/google/callback — Exchange auth code for tokens
app.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.json({ error: `Google OAuth error: ${error}` }, 400);
  }

  if (!code || !state) {
    return c.json({ error: "Missing code or state parameter" }, 400);
  }

  // Verify CSRF nonce
  cleanExpiredNonces();
  if (!csrfNonces.has(state)) {
    return c.json({ error: "Invalid or expired state parameter" }, 400);
  }
  csrfNonces.delete(state);

  // Exchange code for tokens
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    return c.json({ error: `Token exchange failed: ${body}` }, 400);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!tokenData.refresh_token) {
    return c.json(
      { error: "No refresh token received. Re-authorize with prompt=consent." },
      400
    );
  }

  // Get user info from Google
  const userInfoResponse = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );
  const userInfo = (await userInfoResponse.json()) as {
    email: string;
    name?: string;
  };

  // Encrypt refresh token
  const { ciphertext, iv } = await encrypt(tokenData.refresh_token);

  // Store connection
  const label = userInfo.name || userInfo.email;
  const scopes = tokenData.scope || "openid email profile";
  await createOAuthConnection(label, userInfo.email, ciphertext, iv, scopes);

  // Redirect back to frontend OAuth page
  const frontendUrl = GOOGLE_REDIRECT_URI.replace(
    "/oauth/google/callback",
    "/#oauth"
  );
  return c.redirect(frontendUrl);
});

// GET /oauth/connections — List all connections (tokens redacted)
app.get("/connections", async (c) => {
  return c.json(await listOAuthConnections());
});

// PATCH /oauth/connections/:id — Update connection label
app.patch("/connections/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { label } = body;
  if (!label || typeof label !== "string") {
    return c.json({ error: "label is required" }, 400);
  }
  const updated = await updateOAuthConnection(id, { label });
  // Return without tokens
  const { encryptedRefreshToken, encryptionIv, ...safe } = updated;
  return c.json(safe);
});

// DELETE /oauth/connections/:id — Revoke token at Google + delete from DB
app.delete("/connections/:id", async (c) => {
  const id = c.req.param("id");
  const connection = await getOAuthConnection(id);
  if (!connection) {
    return c.json({ error: "Connection not found" }, 404);
  }

  // Best-effort revoke at Google
  try {
    const refreshToken = await decrypt(
      connection.encryptedRefreshToken,
      connection.encryptionIv
    );
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
      { method: "POST" }
    );
  } catch (_) {
    // Revocation is best-effort
  }

  await deleteOAuthConnection(id);
  return c.json({ deleted: true });
});

// POST /oauth/token — Token broker (agent route, requires X-Agent-Key)
app.post("/token", async (c) => {
  const apiKey = c.req.header("X-Agent-Key");
  if (!apiKey) {
    return c.json({ error: "X-Agent-Key header is required" }, 401);
  }

  const agent = await findAgentByApiKey(apiKey);
  if (!agent) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  const body = await c.req.json();
  const { oauthConnectionId, scopes: requestedScopes } = body as {
    oauthConnectionId: string;
    scopes?: string;
  };

  if (!oauthConnectionId) {
    return c.json({ error: "oauthConnectionId is required" }, 400);
  }

  // Check agent is linked to this OAuth connection
  const link = await getAgentOAuthLink(agent.id, oauthConnectionId);
  if (!link) {
    await logActivity(agent.id, agent.name, "oauth_token_denied", "google");
    return c.json(
      { error: "Agent is not authorized for this OAuth connection" },
      403
    );
  }

  // Validate requested scopes are within allowed scopes
  if (requestedScopes) {
    const allowed = new Set(link.allowedScopes.split(" "));
    const requested = requestedScopes.split(" ");
    for (const scope of requested) {
      if (!allowed.has(scope)) {
        await logActivity(
          agent.id,
          agent.name,
          "oauth_token_denied",
          "google"
        );
        return c.json({ error: `Scope '${scope}' is not allowed` }, 403);
      }
    }
  }

  // Decrypt refresh token and exchange for access token
  const connection = await getOAuthConnection(oauthConnectionId);
  if (!connection) {
    return c.json({ error: "OAuth connection not found" }, 404);
  }

  const refreshToken = await decrypt(
    connection.encryptedRefreshToken,
    connection.encryptionIv
  );

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    await logActivity(agent.id, agent.name, "oauth_token_denied", "google");
    return c.json({ error: `Token refresh failed: ${body}` }, 502);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    id_token?: string;
    expires_in: number;
  };

  await logActivity(agent.id, agent.name, "oauth_token_issued", "google");

  return c.json({
    accessToken: tokenData.access_token,
    idToken: tokenData.id_token || null,
    expiresIn: tokenData.expires_in,
    googleEmail: connection.googleEmail,
  });
});

export default app;
