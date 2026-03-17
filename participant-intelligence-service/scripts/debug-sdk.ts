import 'dotenv-flow/config';
import { Wallet, JsonRpcProvider, getLogicDriver, ManifestCoder } from 'js-moi-sdk';
import * as fs from 'fs';
import * as path from 'path';

const DERIVATION_PATH = "m/44'/6174'/7020'/0/0";
const LOGIC_ID = "0x200000000dc7b1c2dc801c0d303bfe62b7e48137c27f0961c861d06900000000";

async function main() {
  const mnemonic = process.env.MOI_MNEMONIC;

  // Create a custom provider that logs RPC calls
  class DebugProvider extends JsonRpcProvider {
    async execute(method: string, params: any): Promise<any> {
      console.log('\n=== RPC Call ===');
      console.log('Method:', method);
      console.log('Params:', JSON.stringify(params, (_, v) => {
        if (typeof v === 'bigint') return v.toString();
        if (v instanceof Uint8Array) return '0x' + Buffer.from(v).toString('hex');
        return v;
      }, 2));
      console.log('================\n');

      try {
        const result = await super.execute(method, params);
        console.log('=== RPC Response ===');
        console.log(JSON.stringify(result, null, 2));
        console.log('====================\n');
        return result;
      } catch (e: any) {
        console.log('=== RPC Error ===');
        console.log('Error:', e.message);
        console.log('=================\n');
        throw e;
      }
    }
  }

  const provider = new DebugProvider('https://dev.voyage-rpc.moi.technology/devnet');
  const wallet = await Wallet.fromMnemonic(mnemonic!, DERIVATION_PATH);
  wallet.connect(provider);

  const walletId = await wallet.getIdentifier();
  console.log('Wallet ID:', walletId.toHex());

  // Load manifest from file
  const manifestPath = path.join(__dirname, '../contract/intelligence.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Create a ManifestCoder to encode arguments manually
  const coder = new ManifestCoder(manifest);

  // Test encoding arguments for GetVersion
  console.log('\n--- Test encoding for GetVersion ---');
  try {
    // Try encoding with hex string (which should be converted to bytes)
    const encoded = coder.encodeArguments('GetVersion', walletId.toHex());
    console.log('Encoded calldata (hex string input):', encoded);
  } catch (e: any) {
    console.error('Encoding error with hex string:', e.message);
  }

  try {
    // Try encoding with toBytes()
    const encoded = coder.encodeArguments('GetVersion', walletId.toBytes());
    console.log('Encoded calldata (toBytes input):', encoded);
  } catch (e: any) {
    console.error('Encoding error with toBytes:', e.message);
  }

  // Test encoding for SetCategoryRef (no identifier param)
  console.log('\n--- Test encoding for SetCategoryRef ---');
  try {
    const encoded = coder.encodeArguments('SetCategoryRef', 'FOOD', 'ipfs://test', 'v1.0', BigInt(Date.now() / 1000 | 0));
    console.log('Encoded calldata:', encoded);
  } catch (e: any) {
    console.error('Encoding error:', e.message);
  }

  // Now try getting the LogicDriver
  console.log('\n--- Getting LogicDriver ---');
  try {
    const driver = await getLogicDriver(LOGIC_ID, wallet);
    console.log('Driver created, routines:', Object.keys(driver.routines));

    // Try calling a routine
    console.log('\n--- Calling SetCategoryRef ---');
    const ix = await driver.routines.SetCategoryRef('FOOD', 'ipfs://test', 'v1.0', BigInt(Date.now() / 1000 | 0));
    console.log('Result:', ix);
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

main().catch(console.error);
