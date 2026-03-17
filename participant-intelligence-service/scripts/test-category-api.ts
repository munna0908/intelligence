/**
 * Test CategoryRefs API Flow
 *
 * Tests the full user-signed flow for SetCategoryRef:
 * 1. POST /v1/writes/prepare - get payload data
 * 2. Build ixArgs from payload (simulating what wallet does)
 * 3. Sign ixArgs with test wallet
 * 4. POST /v1/writes/submit - submit signed transaction
 * 5. GET /v1/intelligence/:participantId/categories - verify
 *
 * Prerequisites:
 * - Server running on localhost:3000 (npm run dev)
 * - MOI_MNEMONIC set in env/.env.local
 * - Contract deployed to devnet
 */

import 'dotenv-flow/config';
import { Wallet, JsonRpcProvider } from 'js-moi-sdk';

const API_BASE = 'http://localhost:3000/v1';
const DERIVATION_PATH = "m/44'/6174'/7020'/0/0";

interface PrepareResponse {
  requestId: string;
  status: string;
  action: string;
  summary: string;
  contract: string;
  method: string;
  args: Record<string, unknown>;
  payload: {
    contract: string;
    method: string;
    args: Record<string, unknown>;
    participantId: string;
    nonce: string;
  };
  // Note: ixArgs is NOT returned - wallet builds it from payload
  signingDigest: string;
  expiresAt: number;
  sender: {
    id: string;
    keyId: number;
    sequence: number;
  };
}

interface SubmitResponse {
  requestId: string;
  status: 'submitted' | 'failed';
  txHash?: string;
  message: string;
}

interface CategoryRefsResponse {
  participantId: string;
  categoryRefs: Record<string, {
    ref: string;
    schemaVersion: string;
    updatedAt: number;
  }>;
}

async function main() {
  console.log('=== Testing CategoryRefs API Flow ===\n');

  // Load mnemonic from env
  const mnemonic = process.env['MOI_MNEMONIC'];
  if (!mnemonic) {
    throw new Error('MOI_MNEMONIC not set in environment');
  }

  // Create wallet
  console.log('1. Creating wallet from mnemonic...');
  const wallet = await Wallet.fromMnemonic(mnemonic, DERIVATION_PATH);
  const participantId = (await wallet.getIdentifier()).toHex();
  const keyId = await wallet.getKeyId();

  console.log(`   Participant ID: ${participantId}`);
  console.log(`   Key ID: ${keyId}`);

  // Connect wallet to provider for signing
  const provider = new JsonRpcProvider(process.env['MOI_NETWORK_URL'] || 'https://dev.voyage-rpc.moi.technology/devnet');
  wallet.connect(provider);

  // Test data
  const category = 'HEALTH';
  const ref = `ipfs://QmTest${Date.now()}`;
  const schemaVersion = 'v2.0';
  const updatedAt = Math.floor(Date.now() / 1000);

  // Step 1: Prepare the write
  console.log('\n2. Calling POST /v1/writes/prepare...');
  const prepareBody = {
    requestId: `test-${Date.now()}`,
    participantId,
    keyId,
    action: 'update_category_ref',
    params: {
      category,
      ref,
      schemaVersion,
      updatedAt,
    },
  };

  console.log('   Request:', JSON.stringify(prepareBody, null, 2));

  const prepareRes = await fetch(`${API_BASE}/writes/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prepareBody),
  });

  if (!prepareRes.ok) {
    const error = await prepareRes.text();
    throw new Error(`Prepare failed: ${prepareRes.status} - ${error}`);
  }

  const prepared: PrepareResponse = await prepareRes.json();
  console.log('   Response:', JSON.stringify(prepared, null, 2));

  // Step 2: Build ixArgs from payload (simulating what wallet does)
  // In production, the wallet would build a proper POLO-encoded InteractionObject
  // For this test, we create a simplified mock ixArgs
  console.log('\n3. Building ixArgs from payload (simulating wallet)...');

  // The wallet would use the payload data to build a proper interaction object
  // For testing, we'll create a hex-encoded representation
  const ixArgsHex = '0x' + Buffer.from(JSON.stringify(prepared.payload)).toString('hex');
  console.log(`   ixArgs (first 100 chars): ${ixArgsHex.slice(0, 100)}...`);

  // Step 3: Sign the ixArgs
  console.log('\n4. Signing ixArgs with wallet...');
  const ixArgsBytes = hexToBytes(ixArgsHex);

  // Sign using the wallet's sign method
  const sigAlgo = wallet.signingAlgorithms['ecdsa_secp256k1'];
  const signature = await wallet.sign(ixArgsBytes, sigAlgo);

  console.log(`   Signature: ${signature.slice(0, 40)}...`);

  // Step 4: Submit the signed write
  console.log('\n5. Calling POST /v1/writes/submit...');
  const submitBody = {
    requestId: prepared.requestId,
    participantId,
    action: 'update_category_ref',
    payload: prepared.payload,
    signature,
    ixArgs: ixArgsHex,
    sender: {
      id: prepared.sender.id,
      keyId: prepared.sender.keyId,
    },
  };

  console.log('   Request:', JSON.stringify({
    ...submitBody,
    signature: signature.slice(0, 20) + '...',
    ixArgs: ixArgsHex.slice(0, 50) + '...',
  }, null, 2));

  const submitRes = await fetch(`${API_BASE}/writes/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submitBody),
  });

  const submitResult: SubmitResponse = await submitRes.json();
  console.log('   Response:', JSON.stringify(submitResult, null, 2));

  if (submitResult.status !== 'submitted') {
    console.error('\n   SUBMIT FAILED!');
    return;
  }

  console.log(`\n   Transaction Hash: ${submitResult.txHash}`);

  // Step 5: Verify by reading the category
  console.log('\n6. Verifying: POST /v1/intelligence/:participantId/categories...');

  // Wait a moment for the transaction to be confirmed
  console.log('   Waiting 3 seconds for confirmation...');
  await sleep(3000);

  const verifyRes = await fetch(`${API_BASE}/intelligence/${participantId}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: [category] }),
  });

  if (!verifyRes.ok) {
    const error = await verifyRes.text();
    console.error(`   Verify failed: ${verifyRes.status} - ${error}`);
    return;
  }

  const verifyResult: CategoryRefsResponse = await verifyRes.json();
  console.log('   Response:', JSON.stringify(verifyResult, null, 2));

  // Check if our category was set
  const categoryRef = verifyResult.categoryRefs[category];
  if (categoryRef && categoryRef.ref === ref) {
    console.log('\n=== SUCCESS! Category reference was set correctly ===');
  } else {
    console.log('\n=== VERIFICATION FAILED: Category ref does not match ===');
    console.log(`   Expected ref: ${ref}`);
    console.log(`   Actual ref: ${categoryRef?.ref || 'not found'}`);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
