# Agent Badge - Agentic Identity Vault

## Elevator Pitch

**"Instead of giving your AI agent your passwords, give it an Agent Badge API key. Agent Badge connects to your existing credential store, and when the agent needs to log in, it handles authentication without the agent ever seeing your credentials."**

## Core Concept

Agent Badge is a credential vault bridge that sits between AI agents and existing password managers (like 1Password). When a browser-use agent hits a login page, instead of seeing credentials, it discovers a WebMCP `login_to()` tool injected by the Agent Badge Chrome extension. The extension fetches credentials from the vault, fills the form via DOM manipulation, and the agent's LLM never sees the raw credentials.

Built on top of [WebMCP](https://developer.chrome.com/docs/web-platform/webmcp) - a proposed Chrome web standard (Chrome 146+) that exposes structured tools for AI agents on websites.

## Architecture

```
┌──────────────────┐         ┌──────────────────────────────────┐
│   AI Agent       │         │   Agent Badge SaaS               │
│ (browser-use TS) │         │   (Bun + React)                  │
│                  │         │                                  │
│ Has: API key     │         │ - Agent registration + API keys  │
│ Does NOT have:   │         │ - Credential store (mock 1Pass)  │
│ any passwords    │         │ - Permission policies (can/can't)│
└──────┬───────────┘         │ - Activity log                   │
       │ controls Chrome     └──────────────┬───────────────────┘
       │ via browser-use                    │ API calls
       ▼                                    │
┌──────────────────────────────────────────┐│
│   Chrome 146 (with WebMCP flag)          ││
│                                          ││
│  ┌─ Agent Badge Extension ──────────────┐││
│  │                                      │││
│  │ 1. Detects login forms (heuristic)   │◄┘
│  │ 2. Registers WebMCP login_to() tool  │
│  │ 3. On tool call → fetches creds      │
│  │    from SaaS API → fills form        │
│  │ 4. Agent never sees credentials      │
│  └──────────────────────────────────────┘│
│                                          │
│  ┌─ Mock CRM App (tab) ────────────────┐│
│  │  Login page → Contact list          ││
│  └─────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

## Components

### 1. Agent Badge SaaS (Bun + React)

**Backend (Bun, port 3000):**
- `POST /agents` - Create agent, returns API key
- `GET /agents` - List registered agents
- `POST /credentials` - Store credentials for a site
- `GET /credentials` - List stored credentials
- `GET /credentials/:site` - Fetch credentials for a site (requires valid agent API key)
- `POST /auth` - Validate an agent API key
- `GET /activity` - Get activity log
- `POST /activity` - Log a credential access event
- In-memory data store (no database needed for demo)

**Frontend (React + Vite + Tailwind, port 5173):**
- `/agents` - Agent management (create, view API keys, set permissions)
- `/credentials` - Credential inventory (add/edit/delete, framed as "Connected to 1Password")
- `/activity` - Real-time activity log (which agent used which credential when)
- `/settings` - Configuration

### 2. Chrome Extension (Manifest V3)

**background.js (service worker):**
- Stores the active agent API key
- Makes API calls to Agent Badge SaaS backend
- Returns credentials to content script via message passing

**content.js (injected into all pages):**
- Scans DOM for login forms using heuristics:
  - `input[type=password]`
  - `input[type=email]`
  - Common field names/IDs (username, login, email, password, passwd)
  - Form elements containing password fields
- When login form detected, registers a WebMCP tool:
  ```js
  navigator.modelContext.registerTool({
    name: "login_to",
    description: "Log into this site using credentials from Agent Badge vault",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "The site identifier to log into" }
      }
    },
    execute: async ({ site }) => {
      // 1. Message background.js to fetch credentials from SaaS
      // 2. Fill form fields via DOM
      // 3. Submit form
      // 4. Return success/failure (credentials never in return value)
    }
  });
  ```
- Fills form fields via DOM manipulation (agent LLM never sees values)
- Submits the form

**popup.html:**
- Status indicator (connected/disconnected to SaaS)
- Quick view of active agent session

### 3. Mock CRM App (Bun, port 4000)

A simple but realistic-looking contact management SaaS app.

**Routes:**
- `GET /login` - Login page (email + password form)
- `POST /login` - Authenticate, set session cookie
- `GET /contacts` - Contact list page (protected, requires session)
- `POST /contacts` - Add a contact
- `GET /contacts/:id` - View contact details

**Pages:**
- Login page with email/password inputs
- Contact list with search, showing name/phone/email
- Pre-seeded with demo contacts (John Smith, Alice Jones, etc.)

### 4. Agent Scripts (browser-use TypeScript)

Two scripts for side-by-side comparison demo:

**old-way.ts** - The insecure approach:
- Credentials hardcoded in system prompt
- Agent fills login form by typing credentials (visible in LLM context)
- No audit trail

**badge-way.ts** - The Agent Badge approach:
- Only Agent Badge API key in system prompt
- Agent discovers `login_to()` via WebMCP on the login page
- Calls `login_to('crm')` - extension handles everything
- Credentials never appear in LLM context
- Activity logged to dashboard

Both scripts perform the same task: "Log into the CRM and find John Smith's phone number"

## Data Flow

```
① User opens Agent Badge Dashboard
  → Creates an agent → Gets API key (e.g. ab_key_xK9mQ2...)
  → Stores CRM credentials (email: admin@company.com, pass: P@ssw0rd123)
  → Sets permission: agent ab_key_xK9 CAN access CRM credentials

② Agent starts (badge-way.ts)
  → Opens Chrome 146 with Agent Badge extension installed
  → Extension is configured with API key ab_key_xK9

③ Agent navigates to CRM login page (localhost:4000/login)
  → Extension content.js detects login form (input[type=password] found)
  → Extension registers WebMCP tool: login_to()
  → Agent's browser-use discovers the tool via navigator.modelContext

④ Agent calls login_to({ site: "crm" })
  → content.js messages background.js
  → background.js calls SaaS API: GET /credentials/crm (with API key header)
  → SaaS validates API key, checks permissions, returns credentials
  → SaaS logs activity: "Agent ab_key_xK9 accessed CRM credentials"
  → content.js fills email + password fields via DOM
  → content.js submits the form
  → Returns { success: true, message: "Logged in successfully" }

⑤ Agent is now on /contacts page
  → Searches for "John Smith"
  → Returns phone number to user
  → Credentials were NEVER in the LLM's context window
```

## Demo: Side-by-Side Comparison

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  ❌ OLD WAY                      │  │  ✅ AGENT BADGE                  │
│                                  │  │                                  │
│  System prompt:                  │  │  System prompt:                  │
│  ┌────────────────────────────┐  │  │  ┌────────────────────────────┐  │
│  │ You are a helpful agent.   │  │  │  │ You are a helpful agent.   │  │
│  │                            │  │  │  │                            │  │
│  │ CRM credentials:           │  │  │  │ Agent Badge key:           │  │
│  │   email: admin@co.com      │  │  │  │   ab_key_xK9mQ2...        │  │
│  │   password: P@ssw0rd123    │  │  │  │                            │  │
│  │                            │  │  │  │ Use login_to() WebMCP tool │  │
│  │ ⚠️  LEAKED IN CONTEXT!     │  │  │  │ to authenticate.           │  │
│  └────────────────────────────┘  │  │  └────────────────────────────┘  │
│                                  │  │                                  │
│  Agent transcript:               │  │  Agent transcript:               │
│  ┌────────────────────────────┐  │  │  ┌────────────────────────────┐  │
│  │ > Navigating to CRM...    │  │  │  │ > Navigating to CRM...    │  │
│  │ > Filling email field     │  │  │  │ > Found login_to() tool   │  │
│  │   with "admin@co.com"     │  │  │  │ > Calling login_to("crm") │  │
│  │ > Filling password with   │  │  │  │ > Logged in successfully  │  │
│  │   "P@ssw0rd123"           │  │  │  │ > Searching contacts...   │  │
│  │   ⚠️  VISIBLE TO LLM!     │  │  │  │ > Found: John Smith      │  │
│  │ > Searching contacts...   │  │  │  │   Phone: 555-0123        │  │
│  │ > Found: John Smith       │  │  │  │                            │  │
│  │   Phone: 555-0123         │  │  │  │ Credentials NEVER in      │  │
│  └────────────────────────────┘  │  │  │ LLM context               │  │
│                                  │  │  └────────────────────────────┘  │
│  No audit trail                  │  │                                  │
│                                  │  │  Dashboard shows:               │
│                                  │  │  "Agent ab_key_xK9 logged into │
│                                  │  │   CRM as admin@co.com at 14:32" │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

## Tech Stack

| Component | Tech | Port |
|---|---|---|
| SaaS Backend | Bun (Hono or Express) | 3000 |
| SaaS Frontend | React + Vite + Tailwind | 5173 |
| CRM Mock App | Bun + HTML/CSS | 4000 |
| Chrome Extension | Manifest V3, WebMCP API | - |
| Agent Scripts | browser-use TypeScript | - |
| Chrome | Version 146+ with `--enable-webmcp-testing` flag | - |

## Project Structure

```
agent-badge/
├── packages/
│   ├── saas/
│   │   ├── src/
│   │   │   ├── server.ts          # Bun HTTP server
│   │   │   ├── routes/
│   │   │   │   ├── agents.ts      # Agent CRUD + API key generation
│   │   │   │   ├── credentials.ts # Credential store
│   │   │   │   └── activity.ts    # Activity log
│   │   │   └── store.ts           # In-memory data store
│   │   └── frontend/
│   │       ├── src/
│   │       │   ├── App.tsx
│   │       │   ├── pages/
│   │       │   │   ├── Agents.tsx
│   │       │   │   ├── Credentials.tsx
│   │       │   │   └── Activity.tsx
│   │       │   └── components/
│   │       └── index.html
│   ├── extension/
│   │   ├── manifest.json
│   │   ├── background.js
│   │   ├── content.js
│   │   ├── popup.html
│   │   └── popup.js
│   ├── crm-mock/
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   └── pages/            # HTML templates
│   │   └── data/
│   │       └── contacts.json     # Pre-seeded contacts
│   └── agent/
│       ├── old-way.ts
│       └── badge-way.ts
├── PLAN.md
├── README.md
└── package.json
```

## Weekend Schedule

### Day 1 (Saturday)

| Time | Task |
|---|---|
| Morning | Project scaffolding (monorepo, package setup, shared config) |
| Late morning | SaaS backend (agent CRUD, credential store, permissions, activity log API) |
| Afternoon | Chrome extension (form detection, WebMCP tool registration, credential injection) |
| Evening | Mock CRM app + test extension ↔ CRM end-to-end |

### Day 2 (Sunday)

| Time | Task |
|---|---|
| Morning | SaaS dashboard UI (agent management, credential view, activity log) |
| Midday | Agent scripts (old-way.ts + badge-way.ts) with browser-use |
| Afternoon | Polish side-by-side demo, test full flow |
| Evening | Record demo video, prepare pitch |

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| WebMCP requires Chrome 146 behind a flag | We control the demo machine - just enable the flag |
| browser-use TS may not natively discover WebMCP tools | Fallback: use `page.evaluate()` to call `navigator.modelContext` directly |
| Form detection heuristics may fail on complex sites | For demo we control the CRM app; hybrid approach with manual selectors as fallback |
| WebMCP is brand new (Feb 2026) and may have bugs | Keep the tool registration simple; test early |

## Key Design Principle

**The agent LLM never sees credentials.** The extension connects to the browser's DOM directly, fills form fields, and submits. The WebMCP tool's return value only contains success/failure - never the actual credentials. The SaaS backend validates the agent's API key and logs all access for audit.
