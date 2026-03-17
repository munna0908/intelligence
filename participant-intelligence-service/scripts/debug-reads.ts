import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { Wallet, JsonRpcProvider, getLogicDriver } from 'js-moi-sdk';

dotenvFlow.config({
  path: path.resolve(process.cwd(), 'env'),
  node_env: 'development',
});

const MNEMONIC    = process.env['MOI_MNEMONIC']!;
const DERIV_PATH  = process.env['MOI_DERIVATION_PATH']!;
const NETWORK_URL = process.env['MOI_NETWORK_URL']!;
const LOGIC_ID    = process.env['MOI_INTELLIGENCE_LOGIC_ID']!;

async function main() {
  console.log('NETWORK_URL:', NETWORK_URL);
  console.log('LOGIC_ID:', LOGIC_ID);

  const provider = new JsonRpcProvider(NETWORK_URL);
  const wallet   = await Wallet.fromMnemonic(MNEMONIC, DERIV_PATH);
  wallet.connect(provider);

  const identifier = await wallet.getIdentifier();
  const actorId    = identifier.toHex();
  console.log('Actor ID:', actorId);

  const driver = await getLogicDriver(LOGIC_ID, wallet);
  console.log('Driver routines:', Object.keys(driver.routines));

  console.log('\n--- Calling GetCategoryRef FOOD ---');
  const ctx = driver.routines['GetCategoryRef'](actorId, 'FOOD');
  console.log('ctx type:', typeof ctx, ctx?.constructor?.name);
  
  const callResp = await ctx.call();
  console.log('callResp:', JSON.stringify(callResp, (_, v) => typeof v === 'bigint' ? v.toString() : v));
  
  const decoded = await callResp.result();
  console.log('decoded output:', JSON.stringify(decoded?.output, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('decoded error:', decoded?.error);

  console.log('\n--- Calling GetIntelligenceObject ---');
  const ctx2 = driver.routines['GetIntelligenceObject'](actorId);
  const callResp2 = await ctx2.call();
  const decoded2 = await callResp2.result();
  console.log('output:', JSON.stringify(decoded2?.output, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch(err => { console.error('Error:', err?.message ?? err, err?.stack); process.exit(1); });
