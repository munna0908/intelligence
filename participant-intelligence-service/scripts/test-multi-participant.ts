#!/usr/bin/env tsx
/**
 * Multi-Participant Comprehensive Test
 *
 * Covers every write action and every read endpoint across 3 independent participants.
 * Each participant builds and signs their own transactions directly via the SDK
 * (the service's /prepare endpoint embeds the service wallet identity, so cross-participant
 * writes must be done client-side).  All reads go through the service API.
 *
 * Participants (same mnemonic, different derivation indices):
 *   Alice  m/44'/6174'/1'/0/0  — FOOD + HEALTH  — full session lifecycle (approve)
 *   Bob    m/44'/6174'/1'/0/1  — ADDRESS + PAY  — session lifecycle (deny)
 *   Carol  m/44'/6174'/1'/0/2  — FOOD           — session lifecycle (approve → revoke)
 *
 * Write actions covered (direct SDK):
 *   SetCategoryRef, CreateSessionRequest, ApproveSession, DenySession, RevokeSession
 *
 * Service read endpoints covered:
 *   GET  /v1/intelligence/:participantId
 *   POST /v1/categories/get
 *   GET  /v1/sessions/:participantId/:sessionId
 *   POST /v1/sessions/ensure
 *   POST /v1/sessions/validate
 *   GET  /v1/writes/status/:txHash
 *
 * Usage:
 *   npm run start:dev          # terminal 1
 *   npm run test:multi         # terminal 2
 *
 * Note: Bob and Carol wallets must have devnet fuel (derivation indices 1 and 2).
 */

import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { Wallet, JsonRpcProvider, getLogicDriver } from 'js-moi-sdk';
import type { LogicDriver } from 'js-moi-sdk';
import crypto from 'crypto';

dotenvFlow.config({ path: path.resolve(process.cwd(), 'env'), node_env: 'development' });

const BASE_URL    = `http://localhost:${process.env['PORT'] ?? 3000}`;
const MNEMONIC    = process.env['MOI_MNEMONIC']!;
const NETWORK_URL = process.env['MOI_NETWORK_URL']!;
const LOGIC_ID    = process.env['MOI_INTELLIGENCE_LOGIC_ID']!;

const POLL_INTERVAL_MS  = 3000;
const POLL_MAX_ATTEMPTS = 20;

// ─── HTTP helpers ──────────────────────────────────────────────────────────────
async function get(endpoint: string) {
  const res  = await fetch(`${BASE_URL}${endpoint}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function post(endpoint: string, payload: unknown) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ─── Poll service status endpoint ─────────────────────────────────────────────
async function waitForTx(txHash: string): Promise<'confirmed' | 'failed' | 'timeout'> {
  for (let i = 1; i <= POLL_MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const { status, body } = await get(`/v1/writes/status/${txHash}`);
    const s = (body as any)?.status;
    console.log(`        poll ${i}/${POLL_MAX_ATTEMPTS}: ${s}`);
    if (status === 200 && s === 'confirmed') return 'confirmed';
    if (status === 200 && s === 'failed')    return 'failed';
  }
  return 'timeout';
}

// ─── Direct SDK write: build → sign → submit → poll ──────────────────────────
async function directWrite(
  wallet: Wallet,
  driver: LogicDriver,
  method: string,
  args: unknown[]
): Promise<string | null> {
  const routineFn = (driver.routines as any)[method];
  if (!routineFn) {
    console.log(`      ✗ routine not found: ${method}`);
    return null;
  }

  try {
    const ctx       = routineFn(...args);
    const fuelLimit = Number(await ctx.estimateFuel());
    const ixObject  = await ctx.ixData({ fuel_limit: fuelLimit });
    console.log(`      ✓ prepared  method=${method}  fuel=${fuelLimit}`);

    const sigAlgo  = wallet.signingAlgorithms['ecdsa_secp256k1'];
    const signedIx = await wallet.signInteraction(ixObject, sigAlgo);
    console.log(`      ✓ signed`);

    const provider = wallet.provider as JsonRpcProvider;
    const response = await provider.sendInteraction(signedIx);
    const txHash   = response.hash;
    console.log(`      ✓ submitted  txHash=${txHash}`);

    const outcome = await waitForTx(txHash);
    if (outcome !== 'confirmed') {
      console.log(`      ✗ tx ${outcome}`);
      return null;
    }
    console.log(`      ✓ confirmed`);
    return txHash;
  } catch (err: any) {
    console.log(`      ✗ error: ${err?.message}`);
    return null;
  }
}

// ─── Assert helper ─────────────────────────────────────────────────────────────
function check(label: string, pass: boolean, detail?: string) {
  const icon   = pass ? '✓' : '✗';
  const suffix = detail ? `  (${detail})` : '';
  console.log(`      ${icon} ${label}${suffix}`);
}

function generateSessionId(): string {
  return `sess_${crypto.randomBytes(8).toString('hex')}`;
}

// ─── Participant: Alice — update_category_ref ×2 + full session lifecycle ─────
async function runAlice(wallet: Wallet, driver: LogicDriver, participantId: string) {
  console.log('\n┌─────────────────────────────────────────────────────────');
  console.log('│  Participant: Alice');
  console.log('│  Writes: SetCategoryRef(FOOD), SetCategoryRef(HEALTH),');
  console.log('│          CreateSessionRequest, ApproveSession');
  console.log('│  Reads:  GET intelligence, POST categories/get,');
  console.log('│          GET sessions, POST sessions/ensure,');
  console.log('│          POST sessions/validate (valid + agent_mismatch)');
  console.log('├─────────────────────────────────────────────────────────');

  const now = Math.floor(Date.now() / 1000);

  // ── Write: SetCategoryRef FOOD ───────────────────────────────────────────────
  console.log('\n  [Write] SetCategoryRef → FOOD');
  const foodTx = await directWrite(wallet, driver, 'SetCategoryRef', [
    'FOOD', `ipfs://alice-food-v${now}`, '1.0', BigInt(now),
  ]);
  if (!foodTx) return;

  // ── Write: SetCategoryRef HEALTH ─────────────────────────────────────────────
  console.log('\n  [Write] SetCategoryRef → HEALTH');
  const healthTx = await directWrite(wallet, driver, 'SetCategoryRef', [
    'HEALTH', `ipfs://alice-health-v${now}`, '1.0', BigInt(now),
  ]);
  if (!healthTx) return;

  // ── Read: GET /v1/intelligence ───────────────────────────────────────────────
  console.log('\n  [Read] GET /v1/intelligence/:participantId');
  const { status: is, body: intel } = await get(`/v1/intelligence/${participantId}`);
  check('status 200',         is === 200,                          `got ${is}`);
  check('FOOD ref present',   !!(intel as any)?.categoryRefs?.FOOD);
  check('HEALTH ref present', !!(intel as any)?.categoryRefs?.HEALTH);
  check('version > 0',        Number((intel as any)?.version) > 0, `v${(intel as any)?.version}`);

  // ── Read: POST /v1/categories/get ────────────────────────────────────────────
  console.log('\n  [Read] POST /v1/categories/get [FOOD, HEALTH]');
  const { status: cs, body: cats } = await post('/v1/categories/get', {
    participantId, categories: ['FOOD', 'HEALTH'],
  });
  check('status 200', cs === 200);
  check('FOOD ref matches',   (cats as any)?.categoryRefs?.FOOD?.ref   === `ipfs://alice-food-v${now}`,   (cats as any)?.categoryRefs?.FOOD?.ref);
  check('HEALTH ref matches', (cats as any)?.categoryRefs?.HEALTH?.ref === `ipfs://alice-health-v${now}`, (cats as any)?.categoryRefs?.HEALTH?.ref);

  // ── Session: POST /v1/sessions/ensure ────────────────────────────────────────
  console.log('\n  [Read] POST /v1/sessions/ensure');
  const { status: es, body: ensured } = await post('/v1/sessions/ensure', {
    participantId,
    agentId:            'alice_agent_bot',
    purpose:            'health_and_food',
    requiredCategories: ['FOOD', 'HEALTH'],
    requiredScopes:     ['preferences.food.read', 'health.read'],
    requestedUses:      10,
    ttlSeconds:         3600,
  });
  check('returns pending_signature', es === 200 && (ensured as any)?.status === 'pending_signature');
  const sessionId = (ensured as any)?.sessionId as string ?? generateSessionId();
  check('sessionId present', !!sessionId, sessionId);
  check('ixObject present',  !!(ensured as any)?.writeRequest?.ixObject);

  // ── Write: CreateSessionRequest ──────────────────────────────────────────────
  console.log('\n  [Write] CreateSessionRequest');
  const createTx = await directWrite(wallet, driver, 'CreateSessionRequest', [
    sessionId,
    'alice_agent_bot',
    'health_and_food',
    ['FOOD', 'HEALTH'],
    ['preferences.food.read', 'health.read'],
    BigInt(10),
    BigInt(3600),
    '',
  ]);
  if (!createTx) {
    console.log('      ⚠ Session creation failed — skipping approve/validate steps');
    console.log('\n└─────────────────────────────────────────────────────────');
    return;
  }

  // ── Write: ApproveSession ────────────────────────────────────────────────────
  console.log('\n  [Write] ApproveSession');
  const issuedAt  = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const approveTx = await directWrite(wallet, driver, 'ApproveSession', [
    sessionId, BigInt(issuedAt), BigInt(expiresAt), BigInt(10), '',
  ]);
  if (!approveTx) return;

  // ── Read: GET /v1/sessions/:participantId/:sessionId ─────────────────────────
  console.log('\n  [Read] GET /v1/sessions/:participantId/:sessionId');
  const { status: gss, body: sess } = await get(`/v1/sessions/${participantId}/${sessionId}`);
  check('status 200',       gss === 200,                          `got ${gss}`);
  check('status ACTIVE',    (sess as any)?.status === 'ACTIVE',   (sess as any)?.status);
  check('agentId matches',  (sess as any)?.agentId === 'alice_agent_bot');

  // ── Read: POST /v1/sessions/validate — valid ─────────────────────────────────
  console.log('\n  [Read] POST /v1/sessions/validate → valid');
  const { body: vr } = await post('/v1/sessions/validate', {
    participantId, agentId: 'alice_agent_bot', sessionId,
    requiredCategories: ['FOOD'], requiredScopes: ['preferences.food.read'],
    currentTime: Math.floor(Date.now() / 1000),
  });
  check('valid: true',  (vr as any)?.valid === true, `reason=${(vr as any)?.reason}`);

  // ── Read: POST /v1/sessions/validate — wrong agent ───────────────────────────
  console.log('\n  [Read] POST /v1/sessions/validate → agent_mismatch');
  const { body: wvr } = await post('/v1/sessions/validate', {
    participantId, agentId: 'wrong_agent', sessionId,
    requiredCategories: ['FOOD'], requiredScopes: ['preferences.food.read'],
    currentTime: Math.floor(Date.now() / 1000),
  });
  check('valid: false',          (wvr as any)?.valid === false);
  check('reason: agent_mismatch', (wvr as any)?.reason === 'agent_mismatch', (wvr as any)?.reason);

  console.log('\n└─────────────────────────────────────────────────────────');
}

// ─── Participant: Bob — ADDRESS + PAYMENT + deny session ──────────────────────
async function runBob(wallet: Wallet, driver: LogicDriver, participantId: string) {
  console.log('\n┌─────────────────────────────────────────────────────────');
  console.log('│  Participant: Bob');
  console.log('│  Writes: SetCategoryRef(ADDRESS), SetCategoryRef(PAYMENT),');
  console.log('│          CreateSessionRequest, DenySession');
  console.log('│  Reads:  POST categories/get, GET sessions,');
  console.log('│          POST sessions/validate → wrong_status');
  console.log('├─────────────────────────────────────────────────────────');

  const now = Math.floor(Date.now() / 1000);

  // ── Write: SetCategoryRef ADDRESS ────────────────────────────────────────────
  console.log('\n  [Write] SetCategoryRef → ADDRESS');
  const addrTx = await directWrite(wallet, driver, 'SetCategoryRef', [
    'ADDRESS', `ipfs://bob-address-v${now}`, '1.0', BigInt(now),
  ]);
  if (!addrTx) return;

  // ── Write: SetCategoryRef PAYMENT ────────────────────────────────────────────
  console.log('\n  [Write] SetCategoryRef → PAYMENT');
  const payTx = await directWrite(wallet, driver, 'SetCategoryRef', [
    'PAYMENT', `ipfs://bob-payment-v${now}`, '1.0', BigInt(now),
  ]);
  if (!payTx) return;

  // ── Read: POST /v1/categories/get ────────────────────────────────────────────
  console.log('\n  [Read] POST /v1/categories/get [ADDRESS, PAYMENT]');
  const { status: cs, body: cats } = await post('/v1/categories/get', {
    participantId, categories: ['ADDRESS', 'PAYMENT'],
  });
  check('status 200',             cs === 200);
  check('ADDRESS ref matches', (cats as any)?.categoryRefs?.ADDRESS?.ref === `ipfs://bob-address-v${now}`);
  check('PAYMENT ref matches', (cats as any)?.categoryRefs?.PAYMENT?.ref === `ipfs://bob-payment-v${now}`);

  // ── Session: POST /v1/sessions/ensure ────────────────────────────────────────
  console.log('\n  [Read] POST /v1/sessions/ensure');
  const { status: es, body: ensured } = await post('/v1/sessions/ensure', {
    participantId,
    agentId:            'bob_agent_bot',
    purpose:            'delivery_payment',
    requiredCategories: ['ADDRESS'],
    requiredScopes:     ['profile.address.read'],
    requestedUses:      5,
    ttlSeconds:         1800,
  });
  check('returns pending_signature', es === 200 && (ensured as any)?.status === 'pending_signature');
  const sessionId = (ensured as any)?.sessionId as string ?? generateSessionId();

  // ── Write: CreateSessionRequest ──────────────────────────────────────────────
  console.log('\n  [Write] CreateSessionRequest');
  const createTx = await directWrite(wallet, driver, 'CreateSessionRequest', [
    sessionId, 'bob_agent_bot', 'delivery_payment',
    ['ADDRESS'], ['profile.address.read'],
    BigInt(5), BigInt(1800), '',
  ]);
  if (!createTx) {
    console.log('      ⚠ Session creation failed — skipping deny/validate steps');
    console.log('\n└─────────────────────────────────────────────────────────');
    return;
  }

  // ── Write: DenySession ───────────────────────────────────────────────────────
  console.log('\n  [Write] DenySession');
  const denyTx = await directWrite(wallet, driver, 'DenySession', [
    sessionId, 'access_not_required',
  ]);
  if (!denyTx) return;

  // ── Read: GET /v1/sessions/:participantId/:sessionId ─────────────────────────
  console.log('\n  [Read] GET /v1/sessions/:participantId/:sessionId');
  const { status: gss, body: sess } = await get(`/v1/sessions/${participantId}/${sessionId}`);
  check('status 200',   gss === 200);
  check('status DENIED', (sess as any)?.status === 'DENIED', (sess as any)?.status);

  // ── Read: POST /v1/sessions/validate — wrong_status ──────────────────────────
  console.log('\n  [Read] POST /v1/sessions/validate → wrong_status');
  const { body: vr } = await post('/v1/sessions/validate', {
    participantId, agentId: 'bob_agent_bot', sessionId,
    requiredCategories: ['ADDRESS'], requiredScopes: ['profile.address.read'],
    currentTime: Math.floor(Date.now() / 1000),
  });
  check('valid: false',        (vr as any)?.valid === false);
  check('reason: wrong_status', (vr as any)?.reason === 'wrong_status', (vr as any)?.reason);

  console.log('\n└─────────────────────────────────────────────────────────');
}

// ─── Participant: Carol — FOOD + approve then revoke ──────────────────────────
async function runCarol(wallet: Wallet, driver: LogicDriver, participantId: string) {
  console.log('\n┌─────────────────────────────────────────────────────────');
  console.log('│  Participant: Carol');
  console.log('│  Writes: SetCategoryRef(FOOD), CreateSessionRequest,');
  console.log('│          ApproveSession, RevokeSession');
  console.log('│  Reads:  GET sessions, POST sessions/validate (valid → wrong_status)');
  console.log('├─────────────────────────────────────────────────────────');

  const now = Math.floor(Date.now() / 1000);

  // ── Write: SetCategoryRef FOOD ───────────────────────────────────────────────
  console.log('\n  [Write] SetCategoryRef → FOOD');
  const foodTx = await directWrite(wallet, driver, 'SetCategoryRef', [
    'FOOD', `ipfs://carol-food-v${now}`, '1.0', BigInt(now),
  ]);
  if (!foodTx) return;

  // ── Session: POST /v1/sessions/ensure ────────────────────────────────────────
  console.log('\n  [Read] POST /v1/sessions/ensure');
  const { status: es, body: ensured } = await post('/v1/sessions/ensure', {
    participantId,
    agentId:            'carol_agent_bot',
    purpose:            'food_ordering',
    requiredCategories: ['FOOD'],
    requiredScopes:     ['preferences.food.read'],
    requestedUses:      3,
    ttlSeconds:         7200,
  });
  check('returns pending_signature', es === 200 && (ensured as any)?.status === 'pending_signature');
  const sessionId = (ensured as any)?.sessionId as string ?? generateSessionId();

  // ── Write: CreateSessionRequest ──────────────────────────────────────────────
  console.log('\n  [Write] CreateSessionRequest');
  const createTx = await directWrite(wallet, driver, 'CreateSessionRequest', [
    sessionId, 'carol_agent_bot', 'food_ordering',
    ['FOOD'], ['preferences.food.read'],
    BigInt(3), BigInt(7200), '',
  ]);
  if (!createTx) {
    console.log('      ⚠ Session creation failed — skipping approve/revoke steps');
    console.log('\n└─────────────────────────────────────────────────────────');
    return;
  }

  // ── Write: ApproveSession ────────────────────────────────────────────────────
  console.log('\n  [Write] ApproveSession');
  const issuedAt  = Math.floor(Date.now() / 1000);
  const approveTx = await directWrite(wallet, driver, 'ApproveSession', [
    sessionId, BigInt(issuedAt), BigInt(issuedAt + 7200), BigInt(3), '',
  ]);
  if (!approveTx) return;

  // ── Read: validate — valid before revoke ─────────────────────────────────────
  console.log('\n  [Read] POST /v1/sessions/validate → valid (before revoke)');
  const { body: vr1 } = await post('/v1/sessions/validate', {
    participantId, agentId: 'carol_agent_bot', sessionId,
    requiredCategories: ['FOOD'], requiredScopes: ['preferences.food.read'],
    currentTime: Math.floor(Date.now() / 1000),
  });
  check('valid: true', (vr1 as any)?.valid === true, `reason=${(vr1 as any)?.reason}`);

  // ── Write: RevokeSession ─────────────────────────────────────────────────────
  console.log('\n  [Write] RevokeSession');
  const revokeTx = await directWrite(wallet, driver, 'RevokeSession', [
    sessionId, 'user_requested',
  ]);
  if (!revokeTx) return;

  // ── Read: GET /v1/sessions/:participantId/:sessionId ─────────────────────────
  console.log('\n  [Read] GET /v1/sessions/:participantId/:sessionId');
  const { status: gss, body: sess } = await get(`/v1/sessions/${participantId}/${sessionId}`);
  check('status 200',    gss === 200);
  check('status REVOKED', (sess as any)?.status === 'REVOKED', (sess as any)?.status);

  // ── Read: validate — wrong_status after revoke ───────────────────────────────
  console.log('\n  [Read] POST /v1/sessions/validate → wrong_status (after revoke)');
  const { body: vr2 } = await post('/v1/sessions/validate', {
    participantId, agentId: 'carol_agent_bot', sessionId,
    requiredCategories: ['FOOD'], requiredScopes: ['preferences.food.read'],
    currentTime: Math.floor(Date.now() / 1000),
  });
  check('valid: false',         (vr2 as any)?.valid === false);
  check('reason: wrong_status', (vr2 as any)?.reason === 'wrong_status', (vr2 as any)?.reason);

  console.log('\n└─────────────────────────────────────────────────────────');
}

// ─── Cross-participant isolation ──────────────────────────────────────────────
async function crossParticipantCheck(alice: string, bob: string, carol: string) {
  console.log('\n┌─────────────────────────────────────────────────────────');
  console.log('│  Cross-Participant Isolation');
  console.log('│  Each participant sees only their own categoryRefs');
  console.log('├─────────────────────────────────────────────────────────');

  const checks: Array<[string, string, string[], string[]]> = [
    ['Alice', alice, ['FOOD', 'HEALTH'],    ['ADDRESS', 'PAYMENT']],
    ['Bob',   bob,   ['ADDRESS', 'PAYMENT'], ['FOOD',    'HEALTH'] ],
    ['Carol', carol, ['FOOD'],              ['HEALTH',  'ADDRESS', 'PAYMENT']],
  ];

  for (const [label, participantId, expected, notExpected] of checks) {
    console.log(`\n  [Read] GET /v1/intelligence/${label}`);
    const { status, body } = await get(`/v1/intelligence/${participantId}`);
    check('status 200', status === 200, `got ${status}`);
    const refs = (body as any)?.categoryRefs ?? {};
    for (const cat of expected)    check(`has ${cat}`,              !!refs[cat]);
    for (const cat of notExpected) check(`no ${cat} (isolation)`,  !refs[cat]);
  }

  console.log('\n└─────────────────────────────────────────────────────────');
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const provider = new JsonRpcProvider(NETWORK_URL);

  const derivPaths = [
    "m/44'/6174'/1'/0/0",
    "m/44'/6174'/1'/0/1",
    "m/44'/6174'/1'/0/2",
  ];

  const wallets = await Promise.all(
    derivPaths.map(p => Wallet.fromMnemonic(MNEMONIC, p))
  );
  wallets.forEach(w => w.connect(provider));

  const drivers = await Promise.all(
    wallets.map(w => getLogicDriver(LOGIC_ID, w))
  );

  const ids = await Promise.all(
    wallets.map(async w => (await w.getIdentifier()).toHex())
  );

  const labels = ['Alice', 'Bob', 'Carol'];

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Multi-Participant Comprehensive Test                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Service:  ${BASE_URL}`);
  console.log(`  Network:  ${NETWORK_URL}`);
  console.log('');
  labels.forEach((l, i) => console.log(`  ${l.padEnd(6)} ${ids[i]}`));
  console.log('');

  await runAlice(wallets[0]!, drivers[0]!, ids[0]!);
  await runBob  (wallets[1]!, drivers[1]!, ids[1]!);
  await runCarol(wallets[2]!, drivers[2]!, ids[2]!);
  await crossParticipantCheck(ids[0]!, ids[1]!, ids[2]!);

  console.log('\nDone.');
}

main().catch(err => {
  console.error('\nFatal:', err?.message ?? err);
  process.exit(1);
});
