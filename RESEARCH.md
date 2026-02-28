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

---

## WebMCP Security Model (Current State)

The security model is **explicitly unfinished** — the W3C spec acknowledges this. Active work is underway with Chrome Security, targeting Candidate Recommendation by Q3 2026.

### Known Gaps

- **No agent identity mechanism**: Websites cannot determine which agent is calling their tools. `SubmitEvent.agentInvoked` is a boolean — it indicates an agent is calling but not *which* agent.
- **Session inheritance**: Tools execute within the browser's existing authenticated session (cookies, localStorage, everything). The agent does not need separate credentials — but also gets full session access.
- **Advisory-only hints**: `readOnlyHint`, `destructiveHint`, `idempotentHint` are suggestions to the client, not enforced by the browser.
- **Audit trail gap**: All MCP-initiated actions are logged under the same scope as user access — no way to distinguish agent from user actions server-side.
- **Cross-origin data leakage**: Data from one app's tools can flow into another app's tools through the agent.

### Consent Model

- Browser-mediated permission prompts before tool execution (like geolocation/camera)
- Persistent permissions possible ("always allow" for a web app + client app pair)
- `agent.requestUserInteraction()` for explicit user confirmation during execution
- Websites **cannot** restrict which agents call their tools — any browser-permitted agent can invoke any exposed tool

### Cross-Origin

- Native WebMCP API respects same-origin policy
- **But**: browser extensions (MCP-B polyfill) that aggregate tools across tabs bypass SOP/CORS — data can flow between origins through the agent

### Privacy/Attack Surface

- **Tool poisoning**: Malicious instructions in tool descriptions interpreted by the AI
- **Output injection**: Tainted return values manipulating agent behavior
- **Session credential abuse**: Agent operates with user's full authenticated session
- **Recommendation**: Never pass raw PII in tool responses; use references/tokens instead

---

## OAuth 2.0 Token Exchange (RFC 8693)

### Core Mechanism

Exchange one security token for another at the authorization server's token endpoint:

```http
POST /oauth/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=<user_token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&actor_token=<agent_token>
&actor_token_type=urn:ietf:params:oauth:token-type:access_token
&resource=https://api.example.com
&scope=read:emails
```

### Delegation vs Impersonation

**Impersonation**: Issued token looks like it came from the user. No `act` claim. Resource server cannot tell an agent is involved.

**Delegation** (preferred): Token contains an `act` claim identifying the agent:

```json
{
  "sub": "user-123",
  "scope": "read:emails",
  "act": {
    "sub": "agent-456",
    "client_id": "agent-app-789"
  }
}
```

Delegation chains can be nested:
```json
{
  "sub": "user-123",
  "act": {
    "sub": "orchestrator-agent",
    "act": { "sub": "gmail-agent-789" }
  }
}
```

### `may_act` Claim (Authorization Control)

Declares who is permitted to act on behalf of a user:
```json
{
  "sub": "user-123",
  "may_act": {
    "sub": "agent-456",
    "iss": "https://vault.example.com"
  }
}
```

### Token Type URIs

| URI | Meaning |
|-----|---------|
| `urn:ietf:params:oauth:token-type:access_token` | OAuth 2.0 access token |
| `urn:ietf:params:oauth:token-type:refresh_token` | Refresh token |
| `urn:ietf:params:oauth:token-type:id_token` | OpenID Connect ID token |
| `urn:ietf:params:oauth:token-type:jwt` | Generic JWT |

---

## JWT Access Token Structure (RFC 9068)

### Required Claims

| Claim | Description |
|-------|-------------|
| `iss` | Issuer URL (vault's URL) |
| `sub` | Subject (the user) |
| `aud` | Audience (target resource server) |
| `exp` | Expiration time |
| `iat` | Issued-at time |
| `jti` | Unique token ID (for revocation/replay detection) |
| `client_id` | The client that requested the token |

### Signing Requirements

- MUST be signed (never `alg: "none"`)
- `typ` header MUST be `at+jwt`
- Recommended: RS256 or ES256

### Example Agent Token

```json
{
  "typ": "at+jwt",
  "alg": "ES256"
}
{
  "iss": "https://vault.example.com",
  "sub": "user-123",
  "aud": "https://api.github.com",
  "client_id": "agent-456",
  "exp": 1700000900,
  "iat": 1700000000,
  "jti": "unique-token-id",
  "scope": "repo:read",
  "act": { "sub": "agent-456" }
}
```

---

## Rich Authorization Requests (RFC 9396)

Traditional scopes are coarse (`read`, `write`, `admin`). RAR enables fine-grained permissions:

```json
{
  "type": "vault_credential_access",
  "actions": ["read"],
  "locations": ["https://api.github.com"],
  "identifier": "owner/specific-repo",
  "datatypes": ["code", "issues"],
  "max_uses": 1,
  "valid_tools": ["github_read_repo"]
}
```

Can be embedded in JWT access tokens for resource server enforcement.

---

## DPoP — Proof-of-Possession (RFC 9449)

Binds tokens to a specific agent's cryptographic key pair, preventing token theft/replay.

### Flow

1. Agent generates an Ed25519/P-256 key pair at startup
2. Agent creates a DPoP proof JWT (signed with private key, includes public key in header)
3. Vault issues a DPoP-bound token with `cnf` claim containing key thumbprint
4. Every API request includes both the token and a fresh DPoP proof
5. Even if the token leaks, it's useless without the agent's private key

```json
{
  "sub": "user-123",
  "act": { "sub": "agent-456" },
  "cnf": {
    "jkt": "sha256-thumbprint-of-agent-public-key"
  }
}
```

---

## Agentic JWT (A-JWT) — IETF Draft

An emerging standard ([arXiv 2509.13597](https://arxiv.org/html/2509.13597v1), [IETF draft](https://www.ietf.org/archive/id/draft-goswami-agentic-jwt-00.html)) with claims specifically for AI agents:

| Claim | Description |
|-------|-------------|
| `agent_id` | Agent identifier |
| `agent_checksum` | One-way hash of agent's prompt + tools + config (tampering detection) |
| `intent` | Contains `workflow_id`, `workflow_step`, `execution_context` |
| `delegation_chain` | SHA-256 of pipe-delimited agent_ids, truncated to 16 hex chars |
| `cnf` | Proof-of-possession with agent's public JWK |

Backward-compatible: servers that don't understand A-JWT claims treat it as a regular JWT.

---

## Recommended Token TTLs

| Token Type | Recommended TTL |
|------------|----------------|
| Agent access tokens | 5–15 minutes |
| Per-task tokens | Single use |
| DPoP proofs | ~1 minute (per-request) |
| Refresh tokens (in vault only) | 7–14 days |
| Refresh token rotation | New refresh token on every use; reuse = revoke family |

---

## Credential Vault Architecture

### Envelope Encryption Pattern

The single most important pattern for vault storage:

```
KEK (in KMS or env var)
  │
  │── encrypts ──> Encrypted DEK (stored alongside data)
                      │
                      │── encrypts ──> Encrypted credential data
```

- **DEK (Data Encryption Key)**: Fresh AES-256-GCM key per credential
- **KEK (Key Encryption Key)**: Master key in KMS or env var — only encrypts DEKs
- **Benefits**: Only 32-byte DEKs go to KMS (fast), key rotation = re-encrypt DEKs only, per-credential blast radius

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

def encrypt_secret(plaintext: bytes, master_key: bytes) -> dict:
    dek = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    encrypted_data = AESGCM(dek).encrypt(nonce, plaintext, None)
    encrypted_dek = AESGCM(master_key).encrypt(os.urandom(12), dek, None)
    return {"encrypted_data": encrypted_data, "encrypted_dek": encrypted_dek, "nonce": nonce}
```

### The Secret Zero Problem

How does the vault itself authenticate? How do agents get their first credential?

| Environment | Solution |
|-------------|----------|
| Cloud (AWS/GCP/K8s) | Platform-native identity (IAM roles, service accounts, pod tokens) |
| Vault AppRole | Two-part credential: Role ID (static) + Secret ID (short-lived, response-wrapped) |
| **Hackathon** | Master key from env var; agent API keys issued at registration |

### Audit Logging

Every operation must log: who (agent + user), what (operation + path), when (UTC timestamp), result (success/failure), context (token ID, lease ID).

**HMAC-chained append-only log**: Each entry includes `HMAC(entry_data + prev_entry_hash, audit_key)`. Tampering with any entry breaks the chain.

HashiCorp Vault **refuses to process requests** if no audit device can write — auditability over availability.

---

## Cryptographic Identity Patterns for Agents

### SPIFFE/SPIRE

SPIFFE IDs (`spiffe://trust-domain/path`) identify workloads by what they are, not where they are.

- **X.509-SVID**: SPIFFE ID in certificate SAN. Supports mTLS directly. Short-lived (1-24h), auto-rotated. **Preferred for agent-to-vault.**
- **JWT-SVID**: SPIFFE ID in JWT `sub` claim. Needed behind L7 proxies. Susceptible to replay.
- **SPIRE**: Issues and rotates SVIDs automatically via workload attestation (checks kernel metadata, container labels, K8s pod info).
- **Python**: `pip install spiffe` (py-spiffe)

### DIDs (Decentralized Identifiers)

**`did:key`** — Simplest method. DID *is* the public key. Zero infrastructure. No rotation possible. Best for ephemeral agent identities and hackathon prototyping.

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import base58

private_key = Ed25519PrivateKey.generate()
public_bytes = private_key.public_key().public_bytes_raw()
multicodec = b'\xed\x01' + public_bytes
did = "did:key:z" + base58.b58encode(multicodec).decode()
```

**`did:web`** — Domain-based. `did:web:vault.example.com` resolves to `https://vault.example.com/.well-known/did.json`. Supports key rotation (update hosted doc). Best for vault identity and long-lived agents.

### Verifiable Credentials for Agent Capabilities

A VC asserting agent permissions:

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential", "AgentCapabilityCredential"],
  "issuer": "did:web:vault.example.com",
  "validUntil": "2026-03-01T00:00:00Z",
  "credentialSubject": {
    "id": "did:key:z6Mk...",
    "delegatedBy": "did:web:vault.example.com:users:user-123",
    "capability": {
      "service": "gmail",
      "scopes": ["gmail.readonly", "gmail.send"],
      "maxMessagesPerHour": 100
    }
  }
}
```

**Proof formats**: JWT-based VCs (simplest), JSON-LD Data Integrity Proofs (richest), SD-JWT VC (selective disclosure — reveal only needed claims).

### Macaroons

Bearer tokens built on chained HMAC with offline attenuation:

1. Root macaroon: `HMAC(root_key, identifier)` → signature
2. Add caveat: `new_sig = HMAC(old_sig, predicate)` — one-way, can only add restrictions
3. Verify: Recompute chain from root key, check final signature matches

```
Root: "vault access for user-123"
  + caveat: service = gmail
  + caveat: scopes = gmail.readonly
  + caveat: expires < 2026-03-01T00:00:00Z
  + caveat: agent_id = agent-456
```

**Third-party caveats**: Require a discharge macaroon from an external service (e.g., "user-consent-service confirms user approved this").

- **Python**: `pip install pymacaroons`
- **Go**: `superfly/macaroon` (Fly.io's production implementation)

### Biscuit Tokens

Modern evolution of macaroons using **public-key crypto** (Ed25519) and **Datalog** instead of HMAC + boolean predicates.

- **Authority block**: Created by issuer, signed with root private key — facts about identity and rights
- **Attenuation blocks**: Anyone can append restrictions, cryptographically linked
- **Verification**: Only needs public key (no shared secret distribution)

```datalog
// Authority block (vault issues)
user("user-123");
right("user-123", "gmail", "read");
right("user-123", "gmail", "send");

// Attenuation block (added before giving to agent)
check if resource($r), operation($op), right("user-123", $r, $op);
check if time($t), $t < 2026-03-01T00:00:00Z;
```

| Aspect | Macaroons | Biscuit |
|--------|-----------|---------|
| Crypto | Shared HMAC secret | Public-key (Ed25519) |
| Verification | Requires root secret | Only needs public key |
| Logic | Boolean predicates | Datalog (rules, facts, checks) |
| Data embedding | No | Yes (facts in token) |

- **Python**: `pip install biscuit-python`
- **Node.js**: `@biscuit-auth/biscuit-wasm`

### ZCAP-LD (Authorization Capabilities)

Capability-based auth: "what token do you hold?" not "who are you?"

- Root capability: resource owner has full authority
- Delegation: create capability document granting specific actions to an invoker (by DID), with caveats
- Chaining: re-delegation only reduces authority, never expands
- **Libraries**: Node.js only (`@digitalbazaar/zcap`, `ezcap-express`)

---

## Library Summary by Language

| Technology | Python | Node.js | Go |
|-----------|--------|---------|-----|
| JWT | `PyJWT`, `python-jose` | `jsonwebtoken`, `jose` | `golang-jwt/jwt` |
| DIDs (did:key) | `cryptography` + `base58` | `@digitalbazaar/did-method-key` | Manual |
| Verifiable Credentials | `sd-jwt-python` | `@digitalbazaar/vc`, `did-jwt-vc` | Manual |
| Macaroons | `pymacaroons` | — | `superfly/macaroon` |
| Biscuit | `biscuit-python` | `@biscuit-auth/biscuit-wasm` | `biscuit-go` |
| SPIFFE | `spiffe` (py-spiffe) | — | `go-spiffe` |
| ZCAP-LD | — | `@digitalbazaar/zcap` | — |
| mTLS | `ssl` stdlib, `spiffe-tls` | `tls` module | `crypto/tls` |

---

## Recommended Hackathon Stack

### Layer 1 — Agent Identity
Use `did:key` (Ed25519). Zero infrastructure, instant identity creation.

### Layer 2 — Agent Authentication
JWT with DPoP (proof-of-possession). Include A-JWT claims (`agent_id`, `agent_checksum`, `delegation_chain`) for auditability.

### Layer 3 — Authorization Tokens
**Biscuit tokens** for credential access. Vault issues a Biscuit with agent rights; the agent or orchestrator can attenuate before delegating to sub-agents. Datalog is expressive enough for complex policies but simple enough to prototype.

### Layer 4 — Credential Storage
Envelope encryption (AES-256-GCM). Master key from env var for hackathon. SQLite for metadata.

### Layer 5 — Transport Security
Standard TLS with DPoP-bound JWTs. Upgrade to mTLS with SPIRE if time permits.

### Layer 6 — Audit
HMAC-chained append-only log. Every token exchange and credential access logged with agent + user identity.
