#!/usr/bin/env tsx
/**
 * Check transaction receipt for error details
 */

import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { JsonRpcProvider } from 'js-moi-sdk';

dotenvFlow.config({
  path: path.resolve(process.cwd(), 'env'),
  node_env: 'development',
});

const NETWORK_URL = process.env['MOI_NETWORK_URL']!;
const TX_HASH = process.argv[2];

if (!TX_HASH) {
  console.error('Usage: npx tsx scripts/check-receipt.ts <txHash>');
  process.exit(1);
}

async function main() {
  const provider = new JsonRpcProvider(NETWORK_URL);

  console.log(`Fetching receipt for: ${TX_HASH}`);
  const receipt = await provider.getInteractionReceipt(TX_HASH);

  console.log('\nReceipt:');
  console.log(JSON.stringify(receipt, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
