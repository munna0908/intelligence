#!/usr/bin/env tsx
import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { Wallet, JsonRpcProvider, getLogicDriver } from 'js-moi-sdk';

dotenvFlow.config({ path: path.resolve(process.cwd(), 'env'), node_env: 'development' });

const MNEMONIC    = process.env['MOI_MNEMONIC']!;
const DERIV_PATH  = process.env['MOI_DERIVATION_PATH']!;
const NETWORK_URL = process.env['MOI_NETWORK_URL']!;
const LOGIC_ID    = process.env['MOI_INTELLIGENCE_LOGIC_ID']!;

async function main() {
  const provider = new JsonRpcProvider(NETWORK_URL);
  const wallet   = await Wallet.fromMnemonic(MNEMONIC, DERIV_PATH);
  wallet.connect(provider);

  const identifier = await wallet.getIdentifier();
  const actorId    = identifier.toHex();
  console.log('Actor:', actorId);

  const driver = await getLogicDriver(LOGIC_ID, wallet);

  const fields = ['Category', 'Ref', 'SchemaVersion', 'Exists'];
  for (const field of fields) {
    try {
      const val = await driver.ephemeralState.get(actorId, (b) => {
        b.entity('category_refs').property('FOOD').field(field);
      });
      console.log(`category_refs.FOOD.${field}:`, val?.toString());
    } catch (err: any) {
      console.log(`category_refs.FOOD.${field}: error - ${err?.message}`);
    }
  }

  // Try LastUpdated (BigInt field)
  try {
    const val = await driver.ephemeralState.get<bigint>(actorId, (b) => {
      b.entity('category_refs').property('FOOD').field('LastUpdated');
    });
    console.log(`category_refs.FOOD.LastUpdated:`, val?.toString());
  } catch (err: any) {
    console.log(`category_refs.FOOD.LastUpdated: error - ${err?.message}`);
  }
}

main().catch(err => { console.error('Error:', err?.message ?? err); process.exit(1); });
