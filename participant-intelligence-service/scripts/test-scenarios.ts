#!/usr/bin/env tsx
/**
 * Multi-dApp Scenario Test
 *
 * Simulates real-world dApps writing and reading participant intelligence data.
 *
 * Scenarios:
 *   1. Swiggy        — updates FOOD category ref, checks food ordering session
 *   2. MediApp       — updates HEALTH category ref, checks health session
 *   3. QuickDeliver  — updates ADDRESS category ref, checks delivery session
 *
 * Flow per scenario: write → sign → submit → wait confirmation → read back
 *
 * Usage:
 *   npx tsx scripts/test-scenarios.ts
 */

import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { Wallet, JsonRpcProvider } from 'js-moi-sdk';

dotenvFlow.config({
  path: path.resolve(process.cwd(), 'env'),
  node_env: 'development',
});

const BASE_URL   = `http://localhost:${process.env['PORT'] ?? 3000}`;
const MNEMONIC   = process.env['MOI_MNEMONIC']!;
const DERIV_PATH = process.env['MOI_DERIVATION_PATH']!;
const NETWORK_URL = process.env['MOI_NETWORK_URL']!;

const POLL_INTERVAL_MS  = 3000;
const POLL_MAX_ATTEMPTS = 20;

// ─── dApp Scenarios ────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    name:       'Swiggy (Food Ordering)',
    agentId:    'swiggy_food_bot',
    purpose:    'food_ordering',
    category:   'FOOD' as const,
    ref:        `ipfs://bafyswiggy-food-prefs-v${Date.now()}`,
    scopes:     ['preferences.food.read', 'order_history.read'],
  },
  {
    name:       'MediApp (Health Records)',
    agentId:    'mediapp_health_bot',
    purpose:    'health_consultation',
    category:   'HEALTH' as const,
    ref:        `ipfs://bafymediapp-health-records-v${Date.now()}`,
    scopes:     ['health.records.read', 'health.vitals.read'],
  },
  {
    name:       'QuickDeliver (Delivery Address)',
    agentId:    'quickdeliver_bot',
    purpose:    'delivery_routing',
    category:   'ADDRESS' as const,
    ref:        `ipfs://bafyquickdeliver-address-v${Date.now()}`,
    scopes:     ['profile.address.read'],
  },
];

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

// ─── Poll until tx is confirmed or failed ──────────────────────────────────────
async function waitForTx(txHash: string): Promise<'confirmed' | 'failed' | 'timeout'> {
  for (let i = 1; i <= POLL_MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const { status, body } = await get(`/v1/writes/status/${txHash}`);
    const txStatus = (body as any)?.status;
    console.log(`      poll ${i}/${POLL_MAX_ATTEMPTS}: ${txStatus}`);
    if (status === 200 && txStatus === 'confirmed') return 'confirmed';
    if (status === 200 && txStatus === 'failed')    return 'failed';
  }
  return 'timeout';
}

// ─── Write a category ref and wait for confirmation ───────────────────────────
async function writeCategoryRef(
  wallet: Wallet,
  participantId: string,
  category: string,
  ref: string
): Promise<string | null> {
  const requestId = `req_${category.toLowerCase()}_${Date.now()}`;

  // 1. Prepare
  const { status: prepStatus, body: prepared } = await post('/v1/writes/prepare', {
    requestId,
    participantId,
    action: 'update_category_ref',
    params: {
      category,
      ref,
      schemaVersion: '1.0',
      updatedAt: Math.floor(Date.now() / 1000),
    },
  });

  if (prepStatus !== 200 || !(prepared as any)?.ixObject) {
    console.log(`    ✗ Prepare failed [${prepStatus}]: ${JSON.stringify(prepared)}`);
    return null;
  }
  console.log(`    ✓ Prepared  method=${( prepared as any).method}  fuel_limit=${(prepared as any).ixObject?.fuel_limit}`);

  // 2. Sign
  const sigAlgo  = wallet.signingAlgorithms['ecdsa_secp256k1'];
  const signedIx = await wallet.signInteraction((prepared as any).ixObject, sigAlgo);
  console.log(`    ✓ Signed`);

  // 3. Submit
  const { status: submitStatus, body: submitted } = await post('/v1/writes/submit', {
    requestId: (prepared as any).requestId,
    participantId,
    action: 'update_category_ref',
    signedIx,
  });

  if (submitStatus !== 200 || !(submitted as any)?.txHash) {
    console.log(`    ✗ Submit failed [${submitStatus}]: ${JSON.stringify(submitted)}`);
    return null;
  }
  const txHash = (submitted as any).txHash as string;
  console.log(`    ✓ Submitted txHash=${txHash}`);

  // 4. Wait for confirmation
  const outcome = await waitForTx(txHash);
  if (outcome !== 'confirmed') {
    console.log(`    ✗ Transaction ${outcome}`);
    return null;
  }
  console.log(`    ✓ Confirmed`);
  return txHash;
}

// ─── Check ensure session ──────────────────────────────────────────────────────
async function checkEnsureSession(
  participantId: string,
  agentId: string,
  purpose: string,
  category: string,
  scopes: string[]
): Promise<void> {
  const { status, body } = await post('/v1/sessions/ensure', {
    participantId,
    agentId,
    purpose,
    requiredCategories: [category],
    requiredScopes:     scopes,
    requestedUses:      10,
    ttlSeconds:         3600,
  });

  const b = body as any;
  if (status !== 200) {
    console.log(`    ✗ ensure_session [${status}]: ${JSON.stringify(body)}`);
    return;
  }

  if (b.status === 'approved') {
    console.log(`    ✓ Session already active  sessionId=${b.sessionId}`);
  } else if (b.status === 'pending_signature') {
    console.log(`    ✓ Session pending signature  sessionId=${b.sessionId}`);
    console.log(`      message: ${b.message}`);
    console.log(`      ixObject present: ${!!b.writeRequest?.ixObject}`);
  } else {
    console.log(`    ✓ ensure_session status=${b.status}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const provider = new JsonRpcProvider(NETWORK_URL);
  const wallet   = await Wallet.fromMnemonic(MNEMONIC, DERIV_PATH);
  wallet.connect(provider);
  const participantId = (await wallet.getIdentifier()).toHex();

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║    Multi-dApp Scenario Test                      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Service:        ${BASE_URL}`);
  console.log(`  Network:        ${NETWORK_URL}`);
  console.log(`  Participant ID: ${participantId}`);
  console.log('');

  // ── Run each dApp scenario ─────────────────────────────────────────────────
  for (const scenario of SCENARIOS) {
    console.log(`┌─ Scenario: ${scenario.name}`);
    console.log(`│`);
    console.log(`│  [Write] UpdateCategoryRef → ${scenario.category}`);
    console.log(`│    ref: ${scenario.ref}`);

    const txHash = await writeCategoryRef(wallet, participantId, scenario.category, scenario.ref);

    if (txHash) {
      console.log(`│`);
      console.log(`│  [Read] GET category ref back`);
      const { status, body } = await post('/v1/categories/get', {
        participantId,
        categories: [scenario.category],
      });
      const refs = (body as any)?.categoryRefs;
      const stored = refs?.[scenario.category];
      if (status === 200 && stored) {
        const match = stored.ref === scenario.ref;
        console.log(`│    ✓ ref: ${stored.ref}`);
        console.log(`│    ✓ schemaVersion: ${stored.schemaVersion}`);
        console.log(`│    ${match ? '✓' : '✗'} ref matches written value: ${match}`);
      } else {
        console.log(`│    ✗ Read failed [${status}]: ${JSON.stringify(body)}`);
      }
    }

    console.log(`│`);
    console.log(`│  [Session] ensure_session for ${scenario.agentId}`);
    await checkEnsureSession(participantId, scenario.agentId, scenario.purpose, scenario.category, scenario.scopes);

    console.log(`└${'─'.repeat(50)}`);
    console.log('');
  }

  // ── Final: read full intelligence object ──────────────────────────────────
  console.log('┌─ Final Read: Full Intelligence Object');
  console.log(`│`);
  const { status, body } = await get(`/v1/intelligence/${participantId}`);

  if (status === 200 && body) {
    const b = body as any;
    console.log(`│  participantId: ${b.participantId}`);
    console.log(`│  version:       ${b.version}`);
    console.log(`│  sessions:      ${b.sessions?.length ?? 0} active`);
    console.log(`│  categoryRefs:`);
    for (const [cat, ref] of Object.entries(b.categoryRefs ?? {})) {
      console.log(`│    ${cat}: ${(ref as any).ref}`);
    }
  } else if (status === 404) {
    console.log(`│  Participant not found on-chain (no writes confirmed yet)`);
  } else {
    console.log(`│  Error [${status}]: ${JSON.stringify(body)}`);
  }
  console.log(`└${'─'.repeat(50)}`);
  console.log('');
  console.log('Done.');
}

main().catch(err => {
  console.error('\nFatal:', err?.message ?? err);
  process.exit(1);
});
