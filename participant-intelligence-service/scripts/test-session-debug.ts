import 'dotenv-flow/config';
import { Wallet, JsonRpcProvider, getLogicDriver } from 'js-moi-sdk';

const DERIVATION_PATH = "m/44'/6174'/7020'/0/0";

async function main() {
  const mnemonic = process.env.MOI_MNEMONIC;
  const logicId = process.env.MOI_INTELLIGENCE_LOGIC_ID;

  const provider = new JsonRpcProvider('https://dev.voyage-rpc.moi.technology/devnet');
  const wallet = await Wallet.fromMnemonic(mnemonic!, DERIVATION_PATH);
  wallet.connect(provider);

  const driver = await getLogicDriver(logicId!, wallet);

  const participantId = '0x00000000a8afaab0ec5da925f3fca8cf501909f4c3bfb2254a66bb7000000000';
  const sessionId = 'sess-test-001';

  console.log('Calling GetSession...');
  const ctx = driver.routines.GetSession(participantId, sessionId);
  const callResponse = await ctx.call();
  const response = await callResponse.result() as { output: { session: unknown } | null; error: unknown };
  console.log('Raw response:', JSON.stringify(response, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  console.log('\nChecking response structure:');
  console.log('response.output:', response?.output);
  console.log('response.error:', response?.error);
  console.log('response.output?.session:', response?.output?.session);
}

main().catch(console.error);
