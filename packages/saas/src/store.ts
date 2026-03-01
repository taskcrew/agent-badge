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
      site TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
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

  // Seed demo data if empty
  const agentCount = await sql`SELECT COUNT(*) as count FROM agents`;
  if (Number(agentCount[0].count) === 0) {
    const demoId = crypto.randomUUID();
    await sql`
      INSERT INTO agents (id, name, api_key, created_at)
      VALUES (${demoId}, 'CRM Bot', 'ab_key_xK9mQ2vL8nP3wR7tY1uJ4s', NOW())
    `;
    await sql`
      INSERT INTO credentials (id, site, email, password, created_at)
      VALUES (${crypto.randomUUID()}, 'crm', 'admin@company.com', 'P@ssw0rd123', NOW())
    `;
    await sql`
      INSERT INTO activity (id, agent_id, agent_name, action, site, timestamp)
      VALUES (${crypto.randomUUID()}, ${demoId}, 'CRM Bot', 'credential_access', 'crm', NOW())
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

export async function storeCredential(site: string, email: string, password: string): Promise<Credential> {
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO credentials (id, site, email, password, created_at)
    VALUES (${id}, ${site}, ${email}, ${password}, NOW())
    ON CONFLICT (site) DO UPDATE SET email = ${email}, password = ${password}, id = ${id}
    RETURNING *
  `;
  return rowToCredential(rows[0]);
}

export async function listCredentials(): Promise<Omit<Credential, "password">[]> {
  const rows = await sql`SELECT id, site, email, created_at FROM credentials ORDER BY created_at`;
  return rows.map((row) => ({
    id: row.id as string,
    site: row.site as string,
    email: row.email as string,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

export async function getCredentialBySite(site: string): Promise<Credential | undefined> {
  const rows = await sql`SELECT * FROM credentials WHERE site = ${site} LIMIT 1`;
  return rows.length > 0 ? rowToCredential(rows[0]) : undefined;
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
