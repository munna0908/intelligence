#!/usr/bin/env tsx
/**
 * Test read operations (intelligence object, category refs)
 *
 * Loads env from env/.env.development
 * Requires: service running at localhost:3000 with NODE_ENV=development
 *
 * Usage:
 *   npx tsx scripts/test-reads.ts
 */

import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { Wallet, JsonRpcProvider } from 'js-moi-sdk';

dotenvFlow.config({
  path: path.resolve(process.cwd(), 'env'),
  node_env: 'development',
});

const BASE_URL = `http://localhost:${process.env['PORT'] ?? 3000}`;
const MNEMONIC = process.env['MOI_MNEMONIC']!;
const DERIVATION_PATH = process.env['MOI_DERIVATION_PATH']!;
const NETWORK_URL = process.env['MOI_NETWORK_URL']!;

async function get(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(endpoint: string, payload: unknown) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  // Derive participant ID from wallet
  const provider = new JsonRpcProvider(NETWORK_URL);
  const wallet = await Wallet.fromMnemonic(MNEMONIC, DERIVATION_PATH);
  wallet.connect(provider);
  const participantId = (await wallet.getIdentifier()).toHex();

  console.log('=== Read Operations Test ===');
  console.log(`Service:        ${BASE_URL}`);
  console.log(`Network:        ${NETWORK_URL}`);
  console.log(`Participant ID: ${participantId}`);
  console.log('');

  // ── 1. Get full intelligence object ─────────────────────────────────────────
  console.log(`── GET /v1/intelligence/${participantId} ─`);
  const { status: s1, body: b1 } = await get(`/v1/intelligence/${participantId}`);
  console.log(`Status:   ${s1}`);
  console.log(`Response: ${JSON.stringify(b1, null, 2)}`);

  // ── 2. Get category refs ─────────────────────────────────────────────────────
  console.log('\n── POST /v1/categories/get ──────────────────────────────────────');
  const { status: s2, body: b2 } = await post('/v1/categories/get', {
    participantId,
    categories: ['FOOD', 'HEALTH', 'ADDRESS', 'PAYMENT'],
  });
  console.log(`Status:   ${s2}`);
  console.log(`Response: ${JSON.stringify(b2, null, 2)}`);

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('\nFatal:', err?.message ?? err);
  process.exit(1);
});
