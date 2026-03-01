import postgres from "postgres";

// --- Types ---

export interface Agent {
  id: string;
  name: string;
  apiKey: string;
  description: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface Credential {
  id: string;
  site: string;
  url: string;
  email: string;
  password: string;
  useAgentEmail: boolean;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  site: string;
  credentialId: string;
  detail: string;
  timestamp: string;
}

export interface ActivityMetadata {
  credentialId?: string;
  detail?: string;
}

export interface CredentialAccessStats {
  credentialId: string;
  accessCount: number;
  lastAccessed: string | null;
}

export interface OAuthConnection {
  id: string;
  provider: string;
  label: string;
  googleEmail: string;
  encryptedRefreshToken: string;
  encryptionIv: string;
  scopes: string;
  revoked: boolean;
  createdAt: string;
}

// --- Database connection ---

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = postgres(DATABASE_URL, { ssl: { rejectUnauthorized: false } });

// --- Schema initialization ---

export async function initDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      api_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      site TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Migration: add url column if missing
  await sql`
    ALTER TABLE credentials ADD COLUMN IF NOT EXISTS url TEXT NOT NULL DEFAULT ''
  `;

  // Migration: add use_agent_email column if missing
  await sql`
    ALTER TABLE credentials ADD COLUMN IF NOT EXISTS use_agent_email BOOLEAN NOT NULL DEFAULT FALSE
  `;

  // Drop old unique constraint on site if it exists (url is now the key identifier)
  await sql`
    ALTER TABLE credentials DROP CONSTRAINT IF EXISTS credentials_site_key
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      action TEXT NOT NULL,
      site TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agent_credentials (
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (agent_id, credential_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS oauth_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'google',
      label TEXT NOT NULL,
      google_email TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      encryption_iv TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT 'openid email profile',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Migration: add revoked column if missing
  await sql`
    ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS revoked BOOLEAN NOT NULL DEFAULT FALSE
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agent_oauth_connections (
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      oauth_connection_id TEXT NOT NULL REFERENCES oauth_connections(id) ON DELETE CASCADE,
      allowed_scopes TEXT NOT NULL DEFAULT 'openid email profile',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (agent_id, oauth_connection_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agent_mailboxes (
      agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
      inbox_address TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Migration: add description and expires_at columns to agents
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE agents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;

  // Migration: add credential_id and detail columns to activity
  await sql`ALTER TABLE activity ADD COLUMN IF NOT EXISTS credential_id TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE activity ADD COLUMN IF NOT EXISTS detail TEXT NOT NULL DEFAULT ''`;

  // Performance indexes for activity queries
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_agent_timestamp ON activity(agent_id, timestamp DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_action_site ON activity(action, site)`;

  // Seed demo data if empty
  const agentCount = await sql`SELECT COUNT(*) as count FROM agents`;
  if (Number(agentCount[0].count) === 0) {
    const demoAgentId = crypto.randomUUID();
    const demoCredId = crypto.randomUUID();
    await sql`
      INSERT INTO agents (id, name, api_key, created_at)
      VALUES (${demoAgentId}, 'CRM Bot', 'ab_key_xK9mQ2vL8nP3wR7tY1uJ4s', NOW())
    `;
    await sql`
      INSERT INTO credentials (id, site, url, email, password, created_at)
      VALUES (${demoCredId}, 'NexusCRM', 'https://agent-badge-crm.onrender.com', 'admin@company.com', 'P@ssw0rd123', NOW())
    `;
    await sql`
      INSERT INTO agent_credentials (agent_id, credential_id)
      VALUES (${demoAgentId}, ${demoCredId})
    `;
    await sql`
      INSERT INTO activity (id, agent_id, agent_name, action, site, timestamp)
      VALUES (${crypto.randomUUID()}, ${demoAgentId}, 'CRM Bot', 'credential_access', 'crm', NOW())
    `;
  }
}

// --- Helpers ---

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "ab_key_";
  for (let i = 0; i < 24; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    apiKey: row.api_key as string,
    description: (row.description as string) || "",
    expiresAt: row.expires_at ? (row.expires_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function rowToCredential(row: Record<string, unknown>): Credential {
  return {
    id: row.id as string,
    site: row.site as string,
    url: (row.url as string) || "",
    email: row.email as string,
    password: row.password as string,
    useAgentEmail: row.use_agent_email as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function rowToActivity(row: Record<string, unknown>): ActivityEntry {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    agentName: row.agent_name as string,
    action: row.action as string,
    site: row.site as string,
    credentialId: (row.credential_id as string) || "",
    detail: (row.detail as string) || "",
    timestamp: (row.timestamp as Date).toISOString(),
  };
}

// --- Agent operations ---

export async function createAgent(name: string, description: string = ""): Promise<Agent> {
  const id = crypto.randomUUID();
  const apiKey = generateApiKey();
  const rows = await sql`
    INSERT INTO agents (id, name, description, api_key, created_at)
    VALUES (${id}, ${name}, ${description}, ${apiKey}, NOW())
    RETURNING *
  `;
  return rowToAgent(rows[0]);
}

export async function listAgents(): Promise<Agent[]> {
  const rows = await sql`SELECT * FROM agents ORDER BY created_at`;
  return rows.map(rowToAgent);
}

export async function findAgentByApiKey(apiKey: string): Promise<Agent | undefined> {
  const rows = await sql`SELECT * FROM agents WHERE api_key = ${apiKey} LIMIT 1`;
  return rows.length > 0 ? rowToAgent(rows[0]) : undefined;
}

export async function updateAgent(
  id: string,
  updates: { name?: string; description?: string; expiresAt?: string | null }
): Promise<Agent> {
  const rows = await sql`
    UPDATE agents SET
      name = COALESCE(${updates.name ?? null}, name),
      description = COALESCE(${updates.description ?? null}, description),
      expires_at = ${updates.expiresAt !== undefined ? (updates.expiresAt || null) : sql`expires_at`}
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) throw new Error("Agent not found");
  return rowToAgent(rows[0]);
}

export async function deleteAgent(id: string): Promise<void> {
  await sql`DELETE FROM agents WHERE id = ${id}`;
}

// --- Credential operations ---

export async function storeCredential(site: string, url: string, email: string, password: string, useAgentEmail: boolean = false): Promise<Credential> {
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO credentials (id, site, url, email, password, use_agent_email, created_at)
    VALUES (${id}, ${site}, ${url}, ${email}, ${password}, ${useAgentEmail}, NOW())
    RETURNING *
  `;
  return rowToCredential(rows[0]);
}

export async function listCredentials(): Promise<Omit<Credential, "password">[]> {
  const rows = await sql`SELECT id, site, url, email, use_agent_email, created_at FROM credentials ORDER BY created_at`;
  return rows.map((row) => ({
    id: row.id as string,
    site: row.site as string,
    url: (row.url as string) || "",
    email: row.email as string,
    useAgentEmail: row.use_agent_email as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

export async function updateCredential(
  id: string,
  updates: { site?: string; url?: string; email?: string; password?: string; useAgentEmail?: boolean }
): Promise<Credential> {
  const rows = await sql`
    UPDATE credentials SET
      site = COALESCE(${updates.site ?? null}, site),
      url = COALESCE(${updates.url ?? null}, url),
      email = COALESCE(${updates.email ?? null}, email),
      password = COALESCE(${updates.password ?? null}, password),
      use_agent_email = COALESCE(${updates.useAgentEmail ?? null}, use_agent_email)
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) throw new Error("Credential not found");
  return rowToCredential(rows[0]);
}

export async function deleteCredential(id: string): Promise<void> {
  await sql`DELETE FROM credentials WHERE id = ${id}`;
}

export async function getCredentialByUrl(url: string): Promise<Credential | undefined> {
  // Try exact match first, then origin-based match (stored URL starts with provided origin, or vice versa)
  const rows = await sql`
    SELECT * FROM credentials
    WHERE url = ${url}
       OR url LIKE ${url + '/%'}
       OR ${url} LIKE url || '%'
    ORDER BY
      CASE WHEN url = ${url} THEN 0 ELSE 1 END
    LIMIT 1
  `;
  return rows.length > 0 ? rowToCredential(rows[0]) : undefined;
}

export async function getCredentialBySite(site: string): Promise<Credential | undefined> {
  const rows = await sql`SELECT * FROM credentials WHERE LOWER(site) = LOWER(${site}) LIMIT 1`;
  return rows.length > 0 ? rowToCredential(rows[0]) : undefined;
}

export async function isAgentLinkedToSite(agentId: string, site: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM agent_credentials ac
    JOIN credentials c ON c.id = ac.credential_id
    WHERE ac.agent_id = ${agentId} AND LOWER(c.site) = LOWER(${site})
    LIMIT 1
  `;
  return rows.length > 0;
}

// --- Agent-Credential linking ---

export async function linkAgentCredential(agentId: string, credentialId: string): Promise<void> {
  await sql`
    INSERT INTO agent_credentials (agent_id, credential_id)
    VALUES (${agentId}, ${credentialId})
    ON CONFLICT DO NOTHING
  `;
}

export async function unlinkAgentCredential(agentId: string, credentialId: string): Promise<void> {
  await sql`
    DELETE FROM agent_credentials
    WHERE agent_id = ${agentId} AND credential_id = ${credentialId}
  `;
}

export async function getLinkedCredentials(agentId: string): Promise<string[]> {
  const rows = await sql`
    SELECT credential_id FROM agent_credentials WHERE agent_id = ${agentId}
  `;
  return rows.map((r) => r.credential_id as string);
}

export async function getLinkedAgents(credentialId: string): Promise<string[]> {
  const rows = await sql`
    SELECT agent_id FROM agent_credentials WHERE credential_id = ${credentialId}
  `;
  return rows.map((r) => r.agent_id as string);
}

export async function isAgentLinkedToUrl(agentId: string, url: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM agent_credentials ac
    JOIN credentials c ON c.id = ac.credential_id
    WHERE ac.agent_id = ${agentId}
      AND (c.url = ${url} OR c.url LIKE ${url + '/%'} OR ${url} LIKE c.url || '%')
    LIMIT 1
  `;
  return rows.length > 0;
}

// --- Activity operations ---

export async function logActivity(
  agentId: string,
  agentName: string,
  action: string,
  site: string,
  meta?: ActivityMetadata
): Promise<ActivityEntry> {
  const id = crypto.randomUUID();
  const credentialId = meta?.credentialId || "";
  const detail = meta?.detail || "";
  const rows = await sql`
    INSERT INTO activity (id, agent_id, agent_name, action, site, credential_id, detail, timestamp)
    VALUES (${id}, ${agentId}, ${agentName}, ${action}, ${site}, ${credentialId}, ${detail}, NOW())
    RETURNING *
  `;
  return rowToActivity(rows[0]);
}

export async function listActivity(): Promise<ActivityEntry[]> {
  const rows = await sql`SELECT * FROM activity ORDER BY timestamp`;
  return rows.map(rowToActivity);
}

// --- Rotate agent API key ---

export async function rotateAgentKey(id: string): Promise<Agent> {
  const newKey = generateApiKey();
  const rows = await sql`
    UPDATE agents SET api_key = ${newKey}
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) throw new Error("Agent not found");
  return rowToAgent(rows[0]);
}

// --- Agent expiry check ---

export async function isAgentExpired(agentId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM agents
    WHERE id = ${agentId} AND expires_at IS NOT NULL AND expires_at < NOW()
    LIMIT 1
  `;
  return rows.length > 0;
}

// --- Activity aggregation functions ---

export async function getAgentLastActivityMap(): Promise<Map<string, string>> {
  const rows = await sql`
    SELECT agent_id, MAX(timestamp) as last_activity
    FROM activity
    GROUP BY agent_id
  `;
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.agent_id as string, (row.last_activity as Date).toISOString());
  }
  return map;
}

export async function getRecentActivityForAllAgents(limit: number = 5): Promise<Map<string, ActivityEntry[]>> {
  const rows = await sql`
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY timestamp DESC) as rn
      FROM activity
    ) sub
    WHERE rn <= ${limit}
    ORDER BY agent_id, timestamp DESC
  `;
  const map = new Map<string, ActivityEntry[]>();
  for (const row of rows) {
    const agentId = row.agent_id as string;
    if (!map.has(agentId)) map.set(agentId, []);
    map.get(agentId)!.push(rowToActivity(row));
  }
  return map;
}

export async function getDeniedCountByAgent(): Promise<Map<string, number>> {
  const rows = await sql`
    SELECT agent_id, COUNT(*)::int as denied_count
    FROM activity
    WHERE action IN ('credential_access_denied', 'oauth_token_denied', 'otp_fetch_failed')
    GROUP BY agent_id
  `;
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.agent_id as string, row.denied_count as number);
  }
  return map;
}

export async function isFirstAccess(agentId: string, site: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM activity
    WHERE agent_id = ${agentId}
      AND site = ${site}
      AND action = 'credential_access'
    LIMIT 1
  `;
  return rows.length === 0;
}

export async function getCredentialAccessStats(): Promise<CredentialAccessStats[]> {
  const rows = await sql`
    SELECT
      c.id as credential_id,
      COUNT(a.id)::int as access_count,
      MAX(a.timestamp) as last_accessed
    FROM credentials c
    LEFT JOIN activity a ON (
      a.action = 'credential_access'
      AND (a.credential_id = c.id OR a.site = c.url OR LOWER(a.site) = LOWER(c.site))
    )
    GROUP BY c.id
  `;
  return rows.map((r) => ({
    credentialId: r.credential_id as string,
    accessCount: (r.access_count as number) || 0,
    lastAccessed: r.last_accessed ? (r.last_accessed as Date).toISOString() : null,
  }));
}

// --- OAuth connection operations ---

function rowToOAuthConnection(row: Record<string, unknown>): OAuthConnection {
  return {
    id: row.id as string,
    provider: row.provider as string,
    label: row.label as string,
    googleEmail: row.google_email as string,
    encryptedRefreshToken: row.encrypted_refresh_token as string,
    encryptionIv: row.encryption_iv as string,
    scopes: row.scopes as string,
    revoked: row.revoked as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export async function createOAuthConnection(
  label: string,
  googleEmail: string,
  encryptedRefreshToken: string,
  encryptionIv: string,
  scopes: string
): Promise<OAuthConnection> {
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO oauth_connections (id, label, google_email, encrypted_refresh_token, encryption_iv, scopes, created_at)
    VALUES (${id}, ${label}, ${googleEmail}, ${encryptedRefreshToken}, ${encryptionIv}, ${scopes}, NOW())
    RETURNING *
  `;
  return rowToOAuthConnection(rows[0]);
}

export async function listOAuthConnections(): Promise<Omit<OAuthConnection, "encryptedRefreshToken" | "encryptionIv">[]> {
  const rows = await sql`SELECT id, provider, label, google_email, scopes, revoked, created_at FROM oauth_connections ORDER BY created_at`;
  return rows.map((row) => ({
    id: row.id as string,
    provider: row.provider as string,
    label: row.label as string,
    googleEmail: row.google_email as string,
    scopes: row.scopes as string,
    revoked: row.revoked as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

export async function getOAuthConnection(id: string): Promise<OAuthConnection | undefined> {
  const rows = await sql`SELECT * FROM oauth_connections WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToOAuthConnection(rows[0]) : undefined;
}

export async function deleteOAuthConnection(id: string): Promise<void> {
  await sql`DELETE FROM oauth_connections WHERE id = ${id}`;
}

export async function revokeOAuthConnection(id: string): Promise<void> {
  await sql`
    UPDATE oauth_connections
    SET revoked = TRUE, encrypted_refresh_token = '', encryption_iv = ''
    WHERE id = ${id}
  `;
}

export async function updateOAuthConnection(
  id: string,
  updates: { label?: string }
): Promise<OAuthConnection> {
  const rows = await sql`
    UPDATE oauth_connections SET
      label = COALESCE(${updates.label ?? null}, label)
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) throw new Error("OAuth connection not found");
  return rowToOAuthConnection(rows[0]);
}

// --- Agent-OAuth linking ---

export async function linkAgentOAuth(agentId: string, oauthConnectionId: string, allowedScopes: string): Promise<void> {
  await sql`
    INSERT INTO agent_oauth_connections (agent_id, oauth_connection_id, allowed_scopes)
    VALUES (${agentId}, ${oauthConnectionId}, ${allowedScopes})
    ON CONFLICT DO NOTHING
  `;
}

export async function unlinkAgentOAuth(agentId: string, oauthConnectionId: string): Promise<void> {
  await sql`
    DELETE FROM agent_oauth_connections
    WHERE agent_id = ${agentId} AND oauth_connection_id = ${oauthConnectionId}
  `;
}

export async function getLinkedOAuthConnections(agentId: string): Promise<string[]> {
  const rows = await sql`
    SELECT oauth_connection_id FROM agent_oauth_connections WHERE agent_id = ${agentId}
  `;
  return rows.map((r) => r.oauth_connection_id as string);
}

export async function getAgentOAuthLink(agentId: string, oauthConnectionId: string): Promise<{ allowedScopes: string } | undefined> {
  const rows = await sql`
    SELECT allowed_scopes FROM agent_oauth_connections
    WHERE agent_id = ${agentId} AND oauth_connection_id = ${oauthConnectionId}
    LIMIT 1
  `;
  return rows.length > 0 ? { allowedScopes: rows[0].allowed_scopes as string } : undefined;
}

// --- Agent Mailbox operations ---

export async function setAgentMailbox(agentId: string, inboxAddress: string): Promise<void> {
  await sql`
    INSERT INTO agent_mailboxes (agent_id, inbox_address, created_at)
    VALUES (${agentId}, ${inboxAddress}, NOW())
    ON CONFLICT (agent_id) DO UPDATE SET inbox_address = ${inboxAddress}
  `;
}

export async function getAgentMailbox(agentId: string): Promise<string | undefined> {
  const rows = await sql`
    SELECT inbox_address FROM agent_mailboxes WHERE agent_id = ${agentId} LIMIT 1
  `;
  return rows.length > 0 ? (rows[0].inbox_address as string) : undefined;
}

export async function deleteAgentMailbox(agentId: string): Promise<void> {
  await sql`DELETE FROM agent_mailboxes WHERE agent_id = ${agentId}`;
}
