#!/usr/bin/env tsx
/**
 * Participant Intelligence Service — API Test Script
 *
 * Tests all API endpoints against a running service instance.
 * Requires the service to be running (defaults to http://localhost:3000).
 *
 * Usage:
 *   npx tsx scripts/test-api.ts                  # run all test groups
 *   npx tsx scripts/test-api.ts health            # health check only
 *   npx tsx scripts/test-api.ts intelligence      # intelligence APIs
 *   npx tsx scripts/test-api.ts sessions          # sessions APIs
 *   npx tsx scripts/test-api.ts writes            # full write flow
 *   npx tsx scripts/test-api.ts all               # all groups (explicit)
 *
 * Options:
 *   --url <url>        Base URL (default: http://localhost:3000)
 *   --mnemonic <m>     Wallet mnemonic for real signing (optional, devnet only)
 *
 * Examples:
 *   npx tsx scripts/test-api.ts --url http://localhost:3000
 *   npx tsx scripts/test-api.ts writes --url http://localhost:4000
 *   npx tsx scripts/test-api.ts all --mnemonic "word1 word2 ... word12"
 */

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  grey:   '\x1b[90m',
};

const pass  = `${C.green}✓${C.reset}`;
const fail  = `${C.red}✗${C.reset}`;
const warn  = `${C.yellow}⚠${C.reset}`;
const arrow = `${C.grey}→${C.reset}`;

// ─── CLI argument parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${C.bold}Participant Intelligence Service — API Test Script${C.reset}

${C.cyan}Usage:${C.reset}
  npx tsx scripts/test-api.ts [group] [options]

${C.cyan}Groups:${C.reset}
  health          Health check endpoint
  intelligence    GET intelligence object, GET category refs
  sessions        GET session, POST ensure, POST validate
  writes          POST prepare → (sign) → POST submit → GET status
  all             Run all groups (default)

${C.cyan}Options:${C.reset}
  --url <url>     Base URL of the running service  (default: http://localhost:3000)
  --mnemonic <m>  Wallet mnemonic for real signing (default: mock/unsigned)

${C.cyan}Examples:${C.reset}
  npx tsx scripts/test-api.ts
  npx tsx scripts/test-api.ts writes
  npx tsx scripts/test-api.ts all --url http://localhost:4000
  npx tsx scripts/test-api.ts writes --mnemonic "word1 word2 word3 ..."
`);
  process.exit(0);
}

// Parse --url
let BASE_URL = 'http://localhost:3000';
const urlIdx = args.indexOf('--url');
if (urlIdx !== -1 && args[urlIdx + 1]) {
  BASE_URL = args[urlIdx + 1];
}

// Parse --mnemonic
let MNEMONIC: string | null = null;
const mnemonicIdx = args.indexOf('--mnemonic');
if (mnemonicIdx !== -1 && args[mnemonicIdx + 1]) {
  MNEMONIC = args[mnemonicIdx + 1];
}

// Parse group (first non-flag argument)
const GROUP = args.find(a => !a.startsWith('--') && a !== args[urlIdx + 1] && a !== args[mnemonicIdx + 1]) ?? 'all';

// ─── Test runner ──────────────────────────────────────────────────────────────
interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];
let currentGroup = '';

function section(name: string, index: number, total: number) {
  currentGroup = name;
  console.log(`\n${C.bold}${C.cyan}${'═'.repeat(52)}${C.reset}`);
  console.log(`${C.bold}  [${index}/${total}] ${name}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${'═'.repeat(52)}${C.reset}`);
}

function ok(label: string, detail?: string) {
  const d = detail ? `\n      ${C.grey}${detail.slice(0, 120)}${C.reset}` : '';
  console.log(`  ${pass} ${label}${d}`);
  results.push({ name: `${currentGroup} › ${label}`, passed: true });
}

function ko(label: string, detail?: string) {
  const d = detail ? `\n      ${C.red}${detail.slice(0, 200)}${C.reset}` : '';
  console.log(`  ${fail} ${C.red}${label}${C.reset}${d}`);
  results.push({ name: `${currentGroup} › ${label}`, passed: false, detail });
}

function note(msg: string) {
  console.log(`  ${warn} ${C.yellow}${msg}${C.reset}`);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function post(path: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function preview(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    ?.slice(0, 140) ?? '(empty)';
}

// ─── Signing helper ───────────────────────────────────────────────────────────
async function signIxObject(ixObject: unknown): Promise<{ ix_args: string; signatures: string }> {
  if (!MNEMONIC) {
    // Mock mode — the server (USE_MOCK_ADAPTER=true) accepts any non-empty values
    return { ix_args: '0x0000', signatures: '0x0000' };
  }

  // Real signing using the wallet SDK (devnet mode)
  const { Wallet, JsonRpcProvider } = await import('js-moi-sdk');
  const DERIVATION_PATH = "m/44'/6174'/7020'/0/0";
  const wallet = await Wallet.fromMnemonic(MNEMONIC, DERIVATION_PATH);
  const provider = new JsonRpcProvider(BASE_URL);
  wallet.connect(provider);

  const sigAlgo = wallet.signingAlgorithms['ecdsa_secp256k1'];
  const signedIx = await wallet.signInteraction(ixObject as any, sigAlgo);
  return signedIx;
}

// ─── Test groups ──────────────────────────────────────────────────────────────

// ── 1. Health ─────────────────────────────────────────────────────────────────
async function testHealth() {
  const { status, body } = await get('/health');

  if (status === 200 && (body as any)?.status === 'ok') {
    ok(`GET /health ${arrow} 200`, preview(body));
  } else {
    ko(`GET /health ${arrow} expected 200 { status: "ok" }`, `got ${status}: ${preview(body)}`);
  }
}

// ── 2. Intelligence ───────────────────────────────────────────────────────────
async function testIntelligence() {

  // 2a. Get full intelligence object for seed participant
  {
    const { status, body } = await get('/v1/intelligence/participant_001');
    const b = body as any;

    if (status === 200 && b?.participantId === 'participant_001' && b?.categoryRefs) {
      ok(`GET /v1/intelligence/participant_001 ${arrow} 200`, preview(b));
    } else {
      ko(`GET /v1/intelligence/participant_001 ${arrow} expected 200 with participantId`, `got ${status}: ${preview(body)}`);
    }
  }

  // 2b. Non-existent participant → 404
  {
    const { status, body } = await get('/v1/intelligence/no_such_participant');

    if (status === 404) {
      ok(`GET /v1/intelligence/no_such_participant ${arrow} 404 (not found)`);
    } else {
      ko(`GET /v1/intelligence/no_such_participant ${arrow} expected 404`, `got ${status}: ${preview(body)}`);
    }
  }

  // 2c. Get specific category refs
  {
    const { status, body } = await post('/v1/categories/get', {
      participantId: 'participant_001',
      categories: ['FOOD', 'HEALTH'],
    });
    const b = body as any;

    if (status === 200 && b?.categoryRefs?.FOOD && b?.categoryRefs?.HEALTH) {
      ok(`POST /v1/categories/get [FOOD, HEALTH] ${arrow} 200`, preview(b.categoryRefs));
    } else {
      ko(`POST /v1/categories/get ${arrow} expected 200 with FOOD + HEALTH refs`, `got ${status}: ${preview(body)}`);
    }
  }

  // 2d. Get category refs — participant_002 (different categories)
  {
    const { status, body } = await post('/v1/categories/get', {
      participantId: 'participant_002',
      categories: ['ADDRESS', 'PAYMENT'],
    });
    const b = body as any;

    if (status === 200 && b?.categoryRefs?.ADDRESS) {
      ok(`POST /v1/categories/get [ADDRESS, PAYMENT] (participant_002) ${arrow} 200`, preview(b.categoryRefs));
    } else {
      ko(`POST /v1/categories/get participant_002 ${arrow} expected 200 with ADDRESS`, `got ${status}: ${preview(body)}`);
    }
  }

  // 2e. Validation error — unknown category
  {
    const { status } = await post('/v1/categories/get', {
      participantId: 'participant_001',
      categories: ['INVALID_CATEGORY'],
    });

    if (status === 400) {
      ok(`POST /v1/categories/get [INVALID_CATEGORY] ${arrow} 400 (validation error)`);
    } else {
      ko(`POST /v1/categories/get invalid category ${arrow} expected 400`, `got ${status}`);
    }
  }
}

// ── 3. Sessions ────────────────────────────────────────────────────────────────
async function testSessions() {

  // 3a. Get existing session
  {
    const { status, body } = await get('/v1/sessions/participant_001/sess_existing_001');
    const b = body as any;

    if (status === 200 && b?.sessionId === 'sess_existing_001' && b?.status === 'ACTIVE') {
      ok(`GET /v1/sessions/participant_001/sess_existing_001 ${arrow} 200 ACTIVE`, preview(b));
    } else {
      ko(`GET /v1/sessions/participant_001/sess_existing_001 ${arrow} expected 200 ACTIVE`, `got ${status}: ${preview(body)}`);
    }
  }

  // 3b. Get non-existent session → 404
  {
    const { status } = await get('/v1/sessions/participant_001/no_such_session');

    if (status === 404) {
      ok(`GET /v1/sessions/participant_001/no_such_session ${arrow} 404 (not found)`);
    } else {
      ko(`GET /v1/sessions/participant_001/no_such_session ${arrow} expected 404`, `got ${status}`);
    }
  }

  // 3c. Ensure session — existing valid session (should return approved)
  {
    const { status, body } = await post('/v1/sessions/ensure', {
      participantId: 'participant_001',
      agentId: 'openclaw_whatsapp_bot',
      purpose: 'food_ordering',
      requiredCategories: ['FOOD'],
      requiredScopes: ['preferences.food.read'],
      requestedUses: 3,
      ttlSeconds: 1800,
    });
    const b = body as any;

    if (status === 200 && b?.status === 'approved' && b?.sessionId) {
      ok(`POST /v1/sessions/ensure (existing session) ${arrow} 200 approved`, `sessionId: ${b.sessionId}`);
    } else {
      ko(`POST /v1/sessions/ensure ${arrow} expected 200 approved`, `got ${status}: ${preview(body)}`);
    }
  }

  // 3d. Ensure session — no valid session (should return pending_signature + ixObject)
  {
    const { status, body } = await post('/v1/sessions/ensure', {
      participantId: 'participant_002',
      agentId: 'new_agent_xyz',
      purpose: 'address_lookup',
      requiredCategories: ['ADDRESS'],
      requiredScopes: ['profile.address.read'],
      requestedUses: 5,
      ttlSeconds: 1800,
    });
    const b = body as any;

    if (
      status === 200 &&
      b?.status === 'pending_signature' &&
      b?.sessionId &&
      b?.writeRequest?.ixObject?.ix_operations
    ) {
      ok(
        `POST /v1/sessions/ensure (new session) ${arrow} 200 pending_signature`,
        `sessionId: ${b.sessionId} | action: ${b.writeRequest.action}`
      );
    } else {
      ko(`POST /v1/sessions/ensure ${arrow} expected 200 pending_signature with ixObject`, `got ${status}: ${preview(body)}`);
    }
  }

  // 3e. Validate session — valid
  {
    const currentTime = Math.floor(Date.now() / 1000);
    const { status, body } = await post('/v1/sessions/validate', {
      participantId: 'participant_001',
      agentId: 'openclaw_whatsapp_bot',
      sessionId: 'sess_existing_001',
      requiredCategories: ['FOOD'],
      requiredScopes: ['preferences.food.read'],
      currentTime,
    });
    const b = body as any;

    if (status === 200 && b?.valid === true && b?.reason === null) {
      ok(`POST /v1/sessions/validate (valid) ${arrow} 200 valid=true`);
    } else {
      ko(`POST /v1/sessions/validate ${arrow} expected 200 valid=true`, `got ${status}: ${preview(body)}`);
    }
  }

  // 3f. Validate session — wrong agent (should fail with reason)
  {
    const currentTime = Math.floor(Date.now() / 1000);
    const { status, body } = await post('/v1/sessions/validate', {
      participantId: 'participant_001',
      agentId: 'wrong_agent',
      sessionId: 'sess_existing_001',
      requiredCategories: ['FOOD'],
      requiredScopes: ['preferences.food.read'],
      currentTime,
    });
    const b = body as any;

    if (status === 200 && b?.valid === false && b?.reason === 'agent_mismatch') {
      ok(`POST /v1/sessions/validate (wrong agent) ${arrow} 200 valid=false reason=agent_mismatch`);
    } else {
      ko(`POST /v1/sessions/validate wrong agent ${arrow} expected valid=false agent_mismatch`, `got ${status}: ${preview(body)}`);
    }
  }

  // 3g. Validate session — missing required category
  {
    const currentTime = Math.floor(Date.now() / 1000);
    const { status, body } = await post('/v1/sessions/validate', {
      participantId: 'participant_001',
      agentId: 'openclaw_whatsapp_bot',
      sessionId: 'sess_existing_001',
      requiredCategories: ['FOOD', 'PAYMENT'],  // PAYMENT not in session
      requiredScopes: ['preferences.food.read'],
      currentTime,
    });
    const b = body as any;

    if (status === 200 && b?.valid === false && b?.reason === 'missing_category') {
      ok(`POST /v1/sessions/validate (missing category) ${arrow} 200 valid=false reason=missing_category`);
    } else {
      ko(`POST /v1/sessions/validate missing category ${arrow} expected valid=false missing_category`, `got ${status}: ${preview(body)}`);
    }
  }
}

// ── 4. Writes: full prepare → sign → submit → status flow ─────────────────────
async function testWrites() {
  const currentTime = Math.floor(Date.now() / 1000);
  const requestId = `req_test_${Date.now()}`;

  if (MNEMONIC) {
    note('Using real wallet signing (devnet mode)');
  } else {
    note('Using mock signing (USE_MOCK_ADAPTER=true required on server)');
  }

  // ── 4a. Prepare: update_category_ref ────────────────────────────────────────
  let ixObject: unknown = null;
  let preparedRequestId = requestId;
  {
    const { status, body } = await post('/v1/writes/prepare', {
      requestId,
      participantId: 'participant_001',
      action: 'update_category_ref',
      params: {
        category: 'FOOD',
        ref: `ipfs://bafytest${Date.now()}`,
        schemaVersion: '1.0',
        updatedAt: currentTime,
      },
    });
    const b = body as any;

    if (
      status === 200 &&
      b?.status === 'ready_to_sign' &&
      b?.ixObject?.sender &&
      b?.ixObject?.ix_operations?.length > 0
    ) {
      ixObject = b.ixObject;
      preparedRequestId = b.requestId;
      ok(
        `POST /v1/writes/prepare (update_category_ref) ${arrow} 200`,
        `method: ${b.method} | fuel_limit: ${b.ixObject.fuel_limit} | expires: ${new Date(b.expiresAt * 1000).toISOString()}`
      );
    } else {
      ko(`POST /v1/writes/prepare ${arrow} expected 200 with ixObject`, `got ${status}: ${preview(body)}`);
    }
  }

  // ── 4b. Sign the ixObject (mock or real wallet) ──────────────────────────────
  let signedIx: { ix_args: string; signatures: string } | null = null;
  if (ixObject) {
    try {
      signedIx = await signIxObject(ixObject);
      if (MNEMONIC) {
        ok(`Signed ixObject with wallet ${arrow} InteractionRequest ready`, `ix_args: ${(signedIx.ix_args).slice(0, 40)}...`);
      } else {
        ok(`Signed ixObject (mock) ${arrow} fake InteractionRequest`);
      }
    } catch (err: any) {
      ko(`Sign ixObject failed`, err?.message);
    }
  }

  // ── 4c. Submit the signed interaction ────────────────────────────────────────
  let txHash: string | null = null;
  if (signedIx) {
    const { status, body } = await post('/v1/writes/submit', {
      requestId: preparedRequestId,
      participantId: 'participant_001',
      action: 'update_category_ref',
      signedIx,
    });
    const b = body as any;

    if (status === 200 && b?.status === 'submitted' && b?.txHash) {
      txHash = b.txHash;
      ok(`POST /v1/writes/submit ${arrow} 200 submitted`, `txHash: ${txHash}`);
    } else {
      ko(`POST /v1/writes/submit ${arrow} expected 200 submitted with txHash`, `got ${status}: ${preview(body)}`);
    }
  }

  // ── 4d. Poll transaction status ──────────────────────────────────────────────
  if (txHash) {
    const { status, body } = await get(`/v1/writes/status/${txHash}`);
    const b = body as any;

    if (status === 200 && ['pending', 'confirmed', 'failed'].includes(b?.status)) {
      ok(`GET /v1/writes/status/${txHash} ${arrow} 200`, `status: ${b.status}`);
    } else {
      ko(`GET /v1/writes/status/${txHash} ${arrow} expected 200 with status`, `got ${status}: ${preview(body)}`);
    }
  }

  // ── 4e. Prepare: create_session_request ─────────────────────────────────────
  {
    const sessionRequestId = `req_sess_${Date.now()}`;
    const { status, body } = await post('/v1/writes/prepare', {
      requestId: sessionRequestId,
      participantId: 'participant_002',
      action: 'create_session_request',
      params: {
        sessionId: `sess_${Date.now()}`,
        agentId: 'test_agent',
        purpose: 'api_testing',
        requiredCategories: ['ADDRESS'],
        requiredScopes: ['profile.address.read'],
        requestedUses: 10,
        ttlSeconds: 3600,
      },
    });
    const b = body as any;

    if (status === 200 && b?.ixObject?.ix_operations?.length > 0) {
      ok(`POST /v1/writes/prepare (create_session_request) ${arrow} 200`, `method: ${b.method}`);
    } else {
      ko(`POST /v1/writes/prepare (create_session_request) ${arrow} expected 200 with ixObject`, `got ${status}: ${preview(body)}`);
    }
  }

  // ── 4f. Prepare: approve_session ────────────────────────────────────────────
  {
    const { status, body } = await post('/v1/writes/prepare', {
      requestId: `req_approve_${Date.now()}`,
      participantId: 'participant_001',
      action: 'approve_session',
      params: {
        sessionId: 'sess_existing_001',
        issuedAt: currentTime,
        expiresAt: currentTime + 3600,
        remainingUses: 10,
        approvalRef: '',
      },
    });
    const b = body as any;

    if (status === 200 && b?.ixObject) {
      ok(`POST /v1/writes/prepare (approve_session) ${arrow} 200`, `method: ${b.method}`);
    } else {
      ko(`POST /v1/writes/prepare (approve_session) ${arrow} expected 200 with ixObject`, `got ${status}: ${preview(body)}`);
    }
  }

  // ── 4g. Prepare: deny_session ────────────────────────────────────────────────
  {
    const { status, body } = await post('/v1/writes/prepare', {
      requestId: `req_deny_${Date.now()}`,
      participantId: 'participant_001',
      action: 'deny_session',
      params: {
        sessionId: 'sess_existing_001',
        reason: 'testing denial',
      },
    });
    const b = body as any;

    if (status === 200 && b?.ixObject) {
      ok(`POST /v1/writes/prepare (deny_session) ${arrow} 200`, `method: ${b.method}`);
    } else {
      ko(`POST /v1/writes/prepare (deny_session) ${arrow} expected 200 with ixObject`, `got ${status}: ${preview(body)}`);
    }
  }

  // ── 4h. Prepare: revoke_session ──────────────────────────────────────────────
  {
    const { status, body } = await post('/v1/writes/prepare', {
      requestId: `req_revoke_${Date.now()}`,
      participantId: 'participant_001',
      action: 'revoke_session',
      params: {
        sessionId: 'sess_existing_001',
        reason: 'testing revocation',
      },
    });
    const b = body as any;

    if (status === 200 && b?.ixObject) {
      ok(`POST /v1/writes/prepare (revoke_session) ${arrow} 200`, `method: ${b.method}`);
    } else {
      ko(`POST /v1/writes/prepare (revoke_session) ${arrow} expected 200 with ixObject`, `got ${status}: ${preview(body)}`);
    }
  }

  // ── 4i. Validation error — invalid action ────────────────────────────────────
  {
    const { status } = await post('/v1/writes/prepare', {
      requestId: 'req_bad',
      participantId: 'participant_001',
      action: 'invalid_action',
      params: {},
    });

    if (status === 400) {
      ok(`POST /v1/writes/prepare (invalid action) ${arrow} 400 (validation error)`);
    } else {
      ko(`POST /v1/writes/prepare invalid action ${arrow} expected 400`, `got ${status}`);
    }
  }

  // ── 4j. Validation error — missing required param ────────────────────────────
  {
    const { status } = await post('/v1/writes/prepare', {
      requestId: 'req_missing',
      participantId: 'participant_001',
      action: 'update_category_ref',
      params: {
        category: 'FOOD',
        // missing: ref, schemaVersion, updatedAt
      },
    });

    if (status === 400) {
      ok(`POST /v1/writes/prepare (missing params) ${arrow} 400 (validation error)`);
    } else {
      ko(`POST /v1/writes/prepare missing params ${arrow} expected 400`, `got ${status}`);
    }
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function printSummary() {
  const total  = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`${C.bold}  Results: ${C.green}${passed} passed${C.reset}${C.bold}  ${failed > 0 ? `${C.red}${failed} failed` : ''}${C.reset}`);

  if (failed > 0) {
    console.log(`\n${C.red}${C.bold}  Failed tests:${C.reset}`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    ${fail} ${r.name}`);
      if (r.detail) console.log(`       ${C.grey}${r.detail.slice(0, 100)}${C.reset}`);
    });
  }

  console.log(`${'─'.repeat(52)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}Participant Intelligence Service — API Tests${C.reset}`);
  console.log(`${C.grey}  Target: ${BASE_URL}${C.reset}`);
  console.log(`${C.grey}  Group:  ${GROUP}${C.reset}`);
  console.log(`${C.grey}  Signing: ${MNEMONIC ? 'real wallet (devnet)' : 'mock'}${C.reset}`);

  const run = (name: string) =>
    GROUP === 'all' || GROUP === name || GROUP === name.split(' ')[0];

  const allGroups = ['health', 'intelligence', 'sessions', 'writes'];
  const total = allGroups.filter(g => run(g)).length;
  let idx = 0;

  if (run('health')) {
    section('Health Check', ++idx, total);
    await testHealth();
  }

  if (run('intelligence')) {
    section('Intelligence API', ++idx, total);
    await testIntelligence();
  }

  if (run('sessions')) {
    section('Sessions API', ++idx, total);
    await testSessions();
  }

  if (run('writes')) {
    section('Writes API (prepare → sign → submit → status)', ++idx, total);
    await testWrites();
  }

  if (idx === 0) {
    console.log(`\n${C.red}Unknown group: "${GROUP}". Use health | intelligence | sessions | writes | all${C.reset}\n`);
    process.exit(1);
  }

  printSummary();
}

main().catch(err => {
  console.error(`\n${C.red}${C.bold}Fatal error:${C.reset} ${err?.message ?? err}\n`);
  console.error(`${C.grey}Is the service running at ${BASE_URL}?${C.reset}\n`);
  process.exit(1);
});
