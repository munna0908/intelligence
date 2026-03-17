#!/usr/bin/env tsx
/**
 * Test write operations (prepare → sign → submit → status)
 *
 * Loads env from env/.env.development
 * Requires: service running at localhost:3000 with NODE_ENV=development
 *
 * Usage:
 *   npx tsx scripts/test-writes.ts
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

async function post(endpoint: string, payload: unknown) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function get(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  // Derive participant ID from wallet
  const provider = new JsonRpcProvider(NETWORK_URL);
  const wallet = await Wallet.fromMnemonic(MNEMONIC, DERIVATION_PATH);
  wallet.connect(provider);
  const participantId = (await wallet.getIdentifier()).toHex();

  console.log('=== Write Flow Test ===');
  console.log(`Service:        ${BASE_URL}`);
  console.log(`Network:        ${NETWORK_URL}`);
  console.log(`Participant ID: ${participantId}`);
  console.log('');

  // ── Step 1: Prepare ──────────────────────────────────────────────────────────
  console.log('── Step 1: POST /v1/writes/prepare ─────────────────────────────');
  const requestId = `req_${Date.now()}`;
  const { status: prepStatus, body: prepared } = await post('/v1/writes/prepare', {
    requestId,
    participantId,
    action: 'update_category_ref',
    params: {
      category: 'FOOD',
      ref: `ipfs://bafytest${Date.now()}`,
      schemaVersion: '1.0',
      updatedAt: Math.floor(Date.now() / 1000),
    },
  });

  console.log(`Status:   ${prepStatus}`);
  console.log(`Response: ${JSON.stringify(prepared, null, 2)}`);

  if (prepStatus !== 200 || !prepared?.ixObject) {
    console.error('\nPrepare failed — stopping.');
    process.exit(1);
  }

  // ── Step 2: Sign ─────────────────────────────────────────────────────────────
  console.log('\n── Step 2: Sign ixObject with wallet ───────────────────────────');
  const sigAlgo = wallet.signingAlgorithms['ecdsa_secp256k1'];
  const signedIx = await wallet.signInteraction(prepared.ixObject, sigAlgo);
  console.log(`Signed: ${JSON.stringify(signedIx)}`);

  // ── Step 3: Submit ───────────────────────────────────────────────────────────
  console.log('\n── Step 3: POST /v1/writes/submit ──────────────────────────────');
  const { status: submitStatus, body: submitted } = await post('/v1/writes/submit', {
    requestId: prepared.requestId,
    participantId,
    action: 'update_category_ref',
    signedIx,
  });

  console.log(`Status:   ${submitStatus}`);
  console.log(`Response: ${JSON.stringify(submitted, null, 2)}`);

  if (submitStatus !== 200 || !submitted?.txHash) {
    console.error('\nSubmit failed — stopping.');
    process.exit(1);
  }

  // ── Step 4: Poll status ──────────────────────────────────────────────────────
  console.log(`\n── Step 4: GET /v1/writes/status/${submitted.txHash} ─`);
  const { status: txStatus, body: txBody } = await get(`/v1/writes/status/${submitted.txHash}`);

  console.log(`Status:   ${txStatus}`);
  console.log(`Response: ${JSON.stringify(txBody, null, 2)}`);

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('\nFatal:', err?.message ?? err);
  process.exit(1);
});
