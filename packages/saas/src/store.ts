import postgres from "postgres";

// --- Types ---

export interface Agent {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
}

export interface Credential {
  id: string;
  site: string;
  url: string;
  email: string;
  password: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  site: string;
  timestamp: string;
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
    timestamp: (row.timestamp as Date).toISOString(),
  };
}

// --- Agent operations ---

export async function createAgent(name: string): Promise<Agent> {
  const id = crypto.randomUUID();
  const apiKey = generateApiKey();
  const rows = await sql`
    INSERT INTO agents (id, name, api_key, created_at)
    VALUES (${id}, ${name}, ${apiKey}, NOW())
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

// --- Credential operations ---

export async function storeCredential(site: string, url: string, email: string, password: string): Promise<Credential> {
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO credentials (id, site, url, email, password, created_at)
    VALUES (${id}, ${site}, ${url}, ${email}, ${password}, NOW())
    RETURNING *
  `;
  return rowToCredential(rows[0]);
}

export async function listCredentials(): Promise<Omit<Credential, "password">[]> {
  const rows = await sql`SELECT id, site, url, email, created_at FROM credentials ORDER BY created_at`;
  return rows.map((row) => ({
    id: row.id as string,
    site: row.site as string,
    url: (row.url as string) || "",
    email: row.email as string,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

export async function updateCredential(
  id: string,
  updates: { site?: string; url?: string; email?: string; password?: string }
): Promise<Credential> {
  const rows = await sql`
    UPDATE credentials SET
      site = COALESCE(${updates.site ?? null}, site),
      url = COALESCE(${updates.url ?? null}, url),
      email = COALESCE(${updates.email ?? null}, email),
      password = COALESCE(${updates.password ?? null}, password)
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
  const rows = await sql`SELECT * FROM credentials WHERE url = ${url} LIMIT 1`;
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
    WHERE ac.agent_id = ${agentId} AND c.url = ${url}
    LIMIT 1
  `;
  return rows.length > 0;
}

// --- Activity operations ---

export async function logActivity(agentId: string, agentName: string, action: string, site: string): Promise<ActivityEntry> {
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO activity (id, agent_id, agent_name, action, site, timestamp)
    VALUES (${id}, ${agentId}, ${agentName}, ${action}, ${site}, NOW())
    RETURNING *
  `;
  return rowToActivity(rows[0]);
}

export async function listActivity(): Promise<ActivityEntry[]> {
  const rows = await sql`SELECT * FROM activity ORDER BY timestamp`;
  return rows.map(rowToActivity);
}
