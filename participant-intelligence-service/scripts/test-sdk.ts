import 'dotenv-flow/config';
import { Wallet, VoyageProvider, JsonRpcProvider, getLogicDriver, Identifier } from 'js-moi-sdk';

const DERIVATION_PATH = "m/44'/6174'/7020'/0/0";
const LOGIC_ID = "0x200000000dc7b1c2dc801c0d303bfe62b7e48137c27f0961c861d06900000000";

async function main() {
  const mnemonic = process.env.MOI_MNEMONIC;

  // Try JsonRpcProvider directly
  console.log('Using JsonRpcProvider directly...');
  const provider = new JsonRpcProvider('https://dev.voyage-rpc.moi.technology/devnet');
  const wallet = await Wallet.fromMnemonic(mnemonic!, DERIVATION_PATH);
  wallet.connect(provider);

  const walletId = await wallet.getIdentifier();
  console.log('Wallet ID (hex):', walletId.toHex());

  // Check if the logic exists by getting context info
  console.log('\n--- Checking logic state ---');
  try {
    const contextInfo = await provider.getContextInfo(LOGIC_ID);
    console.log('Logic context info:', JSON.stringify(contextInfo, null, 2));
  } catch (e: any) {
    console.error('Failed to get context info:', e.message);
  }

  // Also check logic manifest
  console.log('\n--- Checking logic manifest ---');
  try {
    const manifest = await provider.getLogicManifest(LOGIC_ID, { encoding: 'json' });
    console.log('Manifest syntax:', manifest.syntax);
    console.log('Manifest engine:', manifest.engine);
    console.log('First few elements:', manifest.elements?.slice(0, 3).map((e: any) => e.kind));
  } catch (e: any) {
    console.error('Failed to get manifest:', e.message);
  }

  // Debug: Try raw interaction call
  console.log('\n--- Debug: Raw interaction call ---');
  try {
    // Make a raw call interaction
    const callPayload = {
      fuel_limit: 10000,
      fuel_price: 1,
      ix_operations: [{
        type: 19, // LogicInvoke type
        payload: {
          logic_id: LOGIC_ID,
          callsite: 'GetVersion',
          calldata: '0x0d3f0685016163746f725f696406' + walletId.toHex().slice(2)
        }
      }]
    };
    console.log('Call payload:', JSON.stringify(callPayload, null, 2));
    const response = await wallet.sendInteraction(callPayload);
    console.log('Response hash:', response.hash);
    const receipt = await response.wait();
    console.log('Receipt:', JSON.stringify(receipt, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch (e: any) {
    console.error('Raw call error:', e.message);
    if (e.params) console.error('Params:', JSON.stringify(e.params, null, 2));
  }

  // Use getLogicDriver which fetches manifest from network
  console.log('\nGetting LogicDriver...');
  const driver = await getLogicDriver(LOGIC_ID, wallet);

  console.log('LogicDriver created');
  console.log('Available routines:', Object.keys(driver.routines));

  // Test 1: Try SetCategoryRef (string, string, string, u64) - no identifier
  console.log('\n--- Test 1: SetCategoryRef (no identifier param) ---');
  try {
    const category = 'FOOD';
    const ref = 'ipfs://test-ref';
    const schemaVersion = 'v1.0';
    const updatedAt = BigInt(Math.floor(Date.now() / 1000));

    console.log('Calling SetCategoryRef with:', { category, ref, schemaVersion, updatedAt: updatedAt.toString() });
    const ix = await driver.routines.SetCategoryRef(category, ref, schemaVersion, updatedAt);
    console.log('TX Hash:', ix.hash);
    console.log('Waiting for confirmation...');
    const receipt = await ix.wait();
    console.log('Receipt status:', receipt.status);
    console.log('SUCCESS: SetCategoryRef works!');
  } catch (e: any) {
    console.error('Error:', e.message);
    if (e.params) console.error('Error params:', JSON.stringify(e.params, null, 2));
  }

  // Test 2: Try GetCategoryRef (identifier, string)
  console.log('\n--- Test 2: GetCategoryRef (has identifier param) ---');
  try {
    console.log('Calling GetCategoryRef with:', { actorId: walletId.toHex(), category: 'FOOD' });
    const result = await driver.routines.GetCategoryRef(walletId.toHex(), 'FOOD');
    console.log('Result:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch (e: any) {
    console.error('Error:', e.message);
  }

  // Test 3: Try GetVersion with hex string
  console.log('\n--- Test 3: GetVersion with hex string ---');
  try {
    const result = await driver.routines.GetVersion(walletId.toHex());
    console.log('Result:', result);
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

main().catch(console.error);
