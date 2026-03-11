# Participant Intelligence Service

The **Participant Intelligence Service** is the state and authorization control plane for a participant-centric agent system built on the MOI stack. It provides HTTP APIs for managing participant intelligence objects, session-based access control, and signed state mutations.

## Overview

### What is this service?

This service operationalizes the on-chain **ParticipantIntelligenceEngine** contract for apps and agents. It serves as the bridge between client applications (OpenClaw, Inference Service) and the MOI network.

The participant has an on-chain Participant Intelligence Engine object that stores:
- **Category references** (CIDs pointing to participant data)
- **Session/access state** (agent authorizations)
- **Portability-ready participant context metadata**

### Architecture

```
┌─────────────────┐     ┌─────────────────────────────────┐     ┌─────────────────┐
│    OpenClaw     │────▶│  Participant Intelligence       │────▶│   MOI Network   │
│                 │     │  Service                        │     │   (via JS SDK)  │
│  - UI/Wallet    │     │                                 │     │                 │
│  - Session Mgmt │     │  - Session Management           │     │  - Contract     │
└─────────────────┘     │  - Access Validation            │     │    State        │
                        │  - Write Preparation            │     │  - Transactions │
┌─────────────────┐     │  - Transaction Submission       │     └─────────────────┘
│Inference Service│────▶│                                 │
│                 │     │  Prepare → Sign → Submit        │
│  - LLM Calls    │     │                                 │
│  - Context Fetch│     └─────────────────────────────────┘
└─────────────────┘
```

### Design Goals

1. **Participant state exists beyond apps and agents** - Data portability
2. **Agents get fine-grained access via session-based authorization**
3. **Writes require signed transactions** - No unauthorized state mutations
4. **Reads are simple HTTP APIs** backed by MOI JS SDK calls
5. **Writes use prepare → sign → submit flow** - External signing

## Why MOI JS SDK?

The service uses the [MOI JS SDK](https://js-moi-sdk.docs.moi.technology/) as the primary protocol integration layer, similar to how ethers.js or web3.js are used in Ethereum-based systems. The SDK provides:

- **JsonRpcProvider** - Network connectivity
- **LogicDriver** - Contract interaction patterns
- **Wallet/Signer** - Transaction signing (used externally)
- **Serialization** - POLO format for MOI transactions

## Supported Categories (v1)

| Category | Scope |
|----------|-------|
| FOOD | `preferences.food.read` |
| HEALTH | `health.read` |
| ADDRESS | `profile.address.read` |
| PAYMENT | `finance.payment.read` |

## API Reference

### Read APIs

#### GET /v1/intelligence/:participantId

Returns the full participant intelligence object summary.

**Response:**
```json
{
  "participantId": "participant_001",
  "version": "1.0",
  "categoryRefs": {
    "FOOD": {
      "ref": "bafy_food_cid",
      "schemaVersion": "1.0",
      "updatedAt": 1773162200
    }
  },
  "sessions": [
    {
      "sessionId": "sess_123",
      "agentId": "openclaw_whatsapp_bot",
      "status": "ACTIVE",
      "purpose": "food_ordering",
      "approvedCategories": ["FOOD", "HEALTH"],
      "approvedScopes": ["preferences.food.read", "health.read"],
      "expiresAt": 1773165600,
      "remainingUses": 5
    }
  ],
  "metadata": {
    "updatedAt": 1773162200
  }
}
```

#### POST /v1/categories/get

Returns specific category references.

**Request:**
```json
{
  "participantId": "participant_001",
  "categories": ["FOOD", "HEALTH"]
}
```

#### GET /v1/sessions/:participantId/:sessionId

Returns a specific session's details.

#### POST /v1/sessions/validate

Validates a session for the Inference Service.

**Request:**
```json
{
  "participantId": "participant_001",
  "agentId": "openclaw_whatsapp_bot",
  "sessionId": "sess_123",
  "requiredCategories": ["FOOD"],
  "requiredScopes": ["preferences.food.read"],
  "currentTime": 1773162300
}
```

**Response (valid):**
```json
{
  "valid": true,
  "reason": null
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "reason": "missing_scope"
}
```

### Write APIs

#### POST /v1/sessions/ensure

Used by OpenClaw to create or reuse a session.

**Request:**
```json
{
  "participantId": "participant_001",
  "agentId": "openclaw_whatsapp_bot",
  "purpose": "food_ordering",
  "requiredCategories": ["FOOD", "HEALTH"],
  "requiredScopes": ["preferences.food.read", "health.read"],
  "requestedUses": 5,
  "ttlSeconds": 1800
}
```

**Response (approved - existing valid session):**
```json
{
  "status": "approved",
  "sessionId": "sess_123"
}
```

**Response (pending_signature - needs approval):**
```json
{
  "status": "pending_signature",
  "sessionId": "sess_456",
  "message": "Please approve access to FOOD and HEALTH for food_ordering.",
  "writeRequest": {
    "action": "create_session_request",
    "summary": "Approve agent access for FOOD and HEALTH",
    "payload": {...},
    "signingDigest": "0xabc123"
  }
}
```

#### POST /v1/writes/prepare

Prepares a signable transaction for participant state mutation.

**Supported actions:**
- `update_category_ref`
- `create_session_request`
- `approve_session`
- `deny_session`
- `revoke_session`

**Request:**
```json
{
  "requestId": "req_123",
  "participantId": "participant_001",
  "action": "update_category_ref",
  "params": {
    "category": "FOOD",
    "ref": "bafy_new_food_cid",
    "schemaVersion": "1.0",
    "updatedAt": 1773162200
  }
}
```

**Response:**
```json
{
  "requestId": "req_123",
  "status": "ready_to_sign",
  "action": "update_category_ref",
  "summary": "Approve update of FOOD category reference",
  "contract": "ParticipantIntelligenceEngine",
  "method": "SetCategoryRef",
  "args": {...},
  "payload": {...},
  "signingDigest": "0xabc123",
  "expiresAt": 1773162800
}
```

#### POST /v1/writes/submit

Submits a signed transaction to the MOI network.

**Request:**
```json
{
  "requestId": "req_123",
  "participantId": "participant_001",
  "action": "update_category_ref",
  "payload": {...},
  "signature": "0xsignedpayload"
}
```

**Response:**
```json
{
  "requestId": "req_123",
  "status": "submitted",
  "txHash": "0xtx123",
  "message": "Transaction submitted successfully"
}
```

#### GET /v1/writes/status/:txHash

Returns transaction status.

**Response:**
```json
{
  "txHash": "0xtx123",
  "status": "confirmed"
}
```

## Prepare → Sign → Submit Flow

The service enforces a strict signing flow for all state mutations:

```
1. Client calls POST /v1/writes/prepare
   └─▶ Service returns payload + signingDigest

2. Client signs the signingDigest externally (wallet/signer)
   └─▶ User approves in wallet UI

3. Client calls POST /v1/writes/submit with signature
   └─▶ Service submits to MOI network via SDK

4. Client polls GET /v1/writes/status/:txHash
   └─▶ Until status is "confirmed" or "failed"
```

This ensures no unauthorized state changes can occur.

## Session Validation Rules

A session is valid only if ALL conditions are met:

| Rule | Failure Reason |
|------|----------------|
| Session exists | `not_found` |
| Status is ACTIVE | `wrong_status` |
| Agent ID matches | `agent_mismatch` |
| Not expired (currentTime ≤ expiresAt) | `expired` |
| Has remaining uses (remainingUses > 0) | `exhausted` |
| Has all required categories | `missing_category` |
| Has all required scopes | `missing_scope` |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd participant-intelligence-service
npm install
```

### Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Key configuration options:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `NODE_ENV` | development | Environment |
| `MOI_NETWORK_URL` | https://voyage-rpc.moi.technology/babylon/ | MOI RPC endpoint |
| `MOI_INTELLIGENCE_LOGIC_ID` | (required for production) | Deployed contract Logic ID |
| `USE_MOCK_ADAPTER` | true | Use mock adapter for local dev |
| `LOG_LEVEL` | info | Logging level |
| `WRITE_REQUEST_TTL_SECONDS` | 600 | Write request expiry |

### Running Locally

**Development mode (with hot reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

### Running Tests

```bash
npm test           # Run tests once
npm run test:watch # Watch mode
npm run test:coverage # With coverage
```

### Sample API Calls

```bash
# Make the script executable
chmod +x scripts/curl-examples.sh

# Run all examples
./scripts/curl-examples.sh

# Or run individual commands:
curl http://localhost:3000/health
curl http://localhost:3000/v1/intelligence/participant_001
```

## Mock Adapter

The service includes a mock MOI SDK adapter for local development without requiring a real MOI network connection.

### How Mocks Work

- Set `USE_MOCK_ADAPTER=true` in `.env`
- The mock adapter simulates contract state in memory
- Includes pre-seeded sample participants and sessions
- State changes are applied immediately (no actual network delay)

### Sample Mock Data

The mock adapter seeds two participants:

| Participant ID | Categories | Sessions |
|----------------|------------|----------|
| `participant_001` | FOOD, HEALTH | 1 active session |
| `participant_002` | ADDRESS, PAYMENT | No sessions |

### Resetting Mock State

For tests, call `mockStore.reset()` to restore initial state.

## Deploying the Contract

The service includes a Coco smart contract in the `contract/` directory.

### Compile the Contract

```bash
cd contract
coco compile
```

This generates `intelligence.json` containing the compiled contract.

### Deploy to MOI Network

Use the MOI CLI or SDK to deploy the compiled contract:

```bash
# Using MOI CLI (example)
moi deploy ./contract/intelligence.json --network babylon
```

After deployment, you'll receive a **Logic ID** (e.g., `0x0800007d70c34ed6ec4384c75d469894052647a078b33ac0f08db0d3751c1fce29a49a`).

### Contract Endpoints

The deployed `Intelligence` contract exposes these endpoints:

| Endpoint | Type | Description |
|----------|------|-------------|
| `SetCategoryRef` | Dynamic | Update a category reference |
| `RemoveCategoryRef` | Dynamic | Remove a category reference |
| `GetCategoryRef` | Static | Get a single category ref |
| `ListCategoryRefs` | Static | List all category refs |
| `CreateSessionRequest` | Dynamic | Create a new session request |
| `ApproveSession` | Dynamic | Approve a pending session |
| `DenySession` | Dynamic | Deny a session request |
| `GetSession` | Static | Get session details |
| `ValidateSession` | Static | Validate session access |
| `ConsumeSessionUse` | Dynamic | Decrement session uses |
| `RevokeSession` | Dynamic | Revoke an active session |
| `GetIntelligenceObject` | Static | Get full participant state |
| `GetVersion` | Static | Get state version |
| `GetLastUpdatedAt` | Static | Get last update timestamp |

## Integrating Real MOI SDK

To connect to the real MOI network:

### 1. Install MOI SDK packages

```bash
npm install js-moi-sdk js-moi-logic js-moi-wallet
```

### 2. Deploy the contract and get the Logic ID

See "Deploying the Contract" above.

### 3. Configure environment

```bash
# .env
USE_MOCK_ADAPTER=false
MOI_NETWORK_URL=https://voyage-rpc.moi.technology/babylon/
MOI_INTELLIGENCE_LOGIC_ID=0x0800007d...your_logic_id
```

### 4. Start the service

```bash
npm run dev
```

The real adapter will:
- Connect to the MOI network via `JsonRpcProvider`
- Initialize `LogicDriver` with your deployed contract
- Call contract routines for reads (`GetSession`, `ValidateSession`, etc.)
- Submit interactions for writes (`SetCategoryRef`, `CreateSessionRequest`, etc.)

### Real Adapter Features

The `RealMoiSdkAdapter` in `src/adapters/moi-sdk/real.ts`:

- **Lazy initialization** - LogicDriver is created on first use
- **Type-safe mapping** - Contract responses mapped to TypeScript domain models
- **On-chain validation** - Uses contract's `ValidateSession` endpoint
- **BigInt handling** - Properly converts contract bigints to numbers

## Project Structure

```
contract/
├── intelligence.coco      # Coco smart contract source
├── coco.nut               # Coco manifest file
└── intelligence.json      # Compiled contract (generated)

src/
├── app.ts                 # Fastify app setup
├── server.ts              # Entry point
├── config/                # Configuration loading
├── routes/                # Route registration
├── handlers/              # Request handlers
│   ├── intelligence.ts
│   ├── sessions.ts
│   └── writes.ts
├── services/              # Business logic
│   ├── intelligence/
│   ├── sessions/
│   └── writes/
├── adapters/
│   └── moi-sdk/           # MOI SDK adapter layer
│       ├── interface.ts   # Adapter interface
│       ├── mock.ts        # Mock implementation
│       ├── real.ts        # Real MOI SDK implementation
│       └── index.ts       # Factory
├── domain/                # Domain models & types
├── validation/            # Zod schemas
├── logging/               # Structured logging
└── utils/                 # Utility functions

tests/
├── setup.ts               # Test setup
├── unit/                  # Unit tests
└── integration/           # Integration tests
```

## Important Design Rules

1. **This service is NOT inference** - No LLM calls, prompt building, or file parsing
2. **This service is NOT OpenClaw** - No wallet UI or user-facing features
3. **This service is the control plane** - State and authorization only
4. **All writes require signatures** - No bypass for state mutations
5. **MOI SDK adapter is the only network layer** - All chain interactions flow through it

## Logging

The service uses structured JSON logging with Pino. Logged fields include:

- `requestId` - Unique request identifier
- `participantId` - Participant being accessed
- `sessionId` - Session being validated/modified
- `action` - Write action being performed
- `status` - Operation result status
- `txHash` - Transaction hash (for writes)
- `reason` - Validation failure reason

**Sensitive data redaction:**
- Raw signatures are not logged
- Authorization headers are redacted
- Full payloads are summarized

## License

MIT
