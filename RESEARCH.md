# Agent Badge - Research

## Problem

AI agents authenticate poorly today: 44% use static API keys, 43% use username/password, 35% share service accounts. Agents should never hold raw credentials — instead they should get scoped, short-lived tokens from a vault/broker.

## Concept

Instead of an agent logging in with user-provided credentials, credentials are stored in a vault that the agent accesses through a structured interface. The agent never sees raw credentials.

---

## Agentic Identity Landscape

### Emerging Standards & Protocols

**MCP Authorization (Anthropic)**
- OAuth 2.1 mandatory for remote MCP servers, with PKCE and Resource Indicators (RFC 8707)
- Nov 2025: Client ID Metadata Documents (CIMD) and Enterprise-Managed Authorization (Cross App Access)
- Credentials stored in system keychain, never in config

**Cross App Access (XAA) / ID-JAG**
- Open protocol backed by Okta, AWS, Box, Glean, Grammarly, Miro, Writer
- Adopted by IETF OAuth Working Group
- Enterprise IdP becomes the control plane — agent requests scoped, short-lived tokens on-demand
- Early access January 2026

**Google Agent2Agent (A2A)**
- Agent-to-agent communication protocol with 50+ partners
- Supports OAuth 2.0, OIDC, mTLS, JWTs — tokens scoped per task

**OpenID Connect for Agents (OIDC-A)**
- Extension to OIDC for representing, authenticating, and authorizing LLM-based agents
- Includes verification, attestation, and delegation chains

**NIST AI Agent Standards Initiative (Feb 2026)**
- Four pillars: Identification, Authorization, Access Delegation, Logging/Transparency

### Key Products

| Product | Description |
|---------|-------------|
| **Auth0 Token Vault** (GA Oct 2025) | User does one-time OAuth consent, tokens stored in isolated vault per user/tool, agent exchanges its token for scoped provider token. SDKs for LangChain and Vercel AI. |
| **Keycard** ($38M, ex-Auth0 architect) | Dynamic, identity-bound, task-scoped tokens with real-time grant/revoke. |
| **Scalekit** ($5.5M seed) | MCP Auth + Token Vault + Agent Actions in one platform. |
| **HashiCorp Vault** | Dynamic secrets, OIDC integration, validated patterns for AI agent identity. |

### Relevant Concepts

| Concept | Why It Matters |
|---------|---------------|
| OAuth 2.0 Token Exchange (RFC 8693) | Core primitive — trade one token for another |
| SPIFFE/SPIRE | Workload identity for agents (like mTLS for microservices) |
| DIDs & Verifiable Credentials | Cryptographic agent identity proof |
| PKCE | Prevents auth code interception in OAuth flows |
| Resource Indicators (RFC 8707) | Scope tokens to specific servers |

---

## WebMCP (W3C/Chrome Standard)

WebMCP is a proposed W3C standard (Chrome 146+ early preview) that lets websites declare structured tools for AI agents via `navigator.modelContext`.

### Two API Approaches

- **Imperative API**: `registerTool()`, `unregisterTool()`, `provideContext()`, `clearContext()`
- **Declarative API**: HTML form attributes (`toolname`, `tooldescription`, `toolparamtitle`, `toolparamdescription`)

### Key Properties

- Requires active (visible) browsing context — no headless
- Chrome 146+ only, behind `chrome://flags/#enable-webmcp-testing`
- Website must opt in by declaring tools
- No cross-site tool discovery
- CSS pseudo-classes (`:tool-form-active`, `:tool-submit-active`) for visual feedback
- `SubmitEvent.agentInvoked` attribute and `respondWith()` method

### NOT the Same As Browser MCP Servers

WebMCP is a browser-native API where the website declares capabilities. This is different from MCP servers (Playwright MCP, Puppeteer MCP) that automate browsers from the outside.

---

## Browser Use + WebMCP Integration

### Architecture

```
Browser Use (Python)
     │
     │── launches Chrome 146+ with --enable-features=WebMCP
     │── navigates to vault site (WebMCP-enabled)
     │
     ▼
Vault Web App (declares WebMCP tools)
     │── navigator.modelContext.registerTool(...)
     │   e.g. "login_to_service(service_name)"
     │
     ▼
Browser Use discovers & invokes tools via evaluate()
     │── navigator.modelContext.getTools()
     │── navigator.modelContext.invokeTool(name, inputs)
     │
     ▼
Vault handles login behind the scenes
     │── returns session token to the agent
```

### Browser Use Chrome Configuration (Verified from Source)

Browser Use launches Chrome as a direct subprocess via `asyncio.create_subprocess_exec()` and connects over raw CDP. It does NOT use Playwright's launch API.

| Parameter | Documented | Actually Works | Notes |
|-----------|-----------|----------------|-------|
| `executable_path` | Yes | **Yes** | Primary way to specify Chrome version/binary |
| `channel` | Yes | **No** | Field exists in BrowserProfile but is never read by launch code |
| `args` | Yes | **Yes** | Each flag must start with `--`; `--disable-features=` values are merged with defaults |
| `ignore_default_args` | Yes | **Yes** | Pass `True` to strip all defaults, or a list of specific flags |
| `headless` | Yes | **Yes** | WebMCP requires `headless=False` |

### Implementation

```python
from browser_use import Agent, Browser, Tools

browser = Browser(
    executable_path='/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    args=['--enable-features=WebMCP'],
    headless=False,  # required — WebMCP needs visible browsing context
)

tools = Tools()

@tools.action("Discover WebMCP tools on the current page")
async def discover_webmcp_tools(page):
    return await page.evaluate("""
        if (!navigator.modelContext) return { error: 'WebMCP not available' };
        const tools = await navigator.modelContext.getTools();
        return tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
        }));
    """)

@tools.action("Invoke a WebMCP tool by name with given inputs")
async def invoke_webmcp_tool(page, tool_name: str, inputs: dict):
    return await page.evaluate("""
        ([toolName, toolInputs]) => {
            return navigator.modelContext.invokeTool(toolName, toolInputs);
        }
    """, [tool_name, inputs])

agent = Agent(
    task="Go to vault.example.com, discover available tools, and login to Gmail",
    llm=my_llm,
    browser=browser,
    tools=tools,
)
await agent.run()
```

---

## Proposed Hackathon Architecture

```
Agent (via Browser Use)
     │
     │── discovers tools via navigator.modelContext
     │
     ▼
Vault Web App (declares WebMCP tools)
     │
     │── Tool: "list_available_services()"
     │── Tool: "login_and_get_token(service)"
     │── Tool: "get_credentials(service, scopes)"
     │
     ▼
Credential Store (encrypted DB / secrets manager)
     │
     ▼
External Services (Gmail, Slack, etc.)
```

### Design Principles

1. Agent never holds raw credentials — only short-lived, scoped tokens from the vault
2. User consent is decoupled from agent execution — user approves once, agent operates asynchronously
3. Tokens scoped per user, per tool, per task — principle of least privilege
4. Automatic rotation — vault handles refresh token rotation
5. Full audit trail — every token exchange and API call logged
6. Instant revocation — user or admin can revoke agent access at any time

### What to Build

1. **Vault web app** — declares WebMCP tools (`login`, `get_token`, `list_services`)
2. **Two Browser Use custom actions** — `discover_webmcp_tools` and `invoke_webmcp_tool`
3. **Agent workflow** — navigate to vault → discover tools → invoke login → receive scoped token
