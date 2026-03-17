import 'dotenv-flow/config';
import { JsonRpcProvider } from 'js-moi-sdk';

async function main() {
  const provider = new JsonRpcProvider('https://dev.voyage-rpc.moi.technology/devnet');
  const txHash = process.argv[2] || '0x4d33554f407dc705ad7bc65706b8e551983a5f45097ae4c2ded0c35aee176884';

  console.log('Checking receipt for:', txHash);
  const receipt = await provider.getInteractionReceipt(txHash);
  console.log('Receipt:', JSON.stringify(receipt, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch(console.error);
