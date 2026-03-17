#!/usr/bin/env tsx
import 'dotenv-flow/config';

/**
 * Interactive CLI for Intelligence Contract
 *
 * Test various contract operations on the deployed devnet logic.
 *
 * Usage:
 *   npx tsx scripts/interact-devnet.ts <command> [args...]
 *
 * Commands:
 *   set-category <category> <ref> <schema_version>
 *       Set a category reference (FOOD, HEALTH, ADDRESS, PAYMENT)
 *
 *   get-category <actor_id> <category>
 *       Get a category reference
 *
 *   list-categories <actor_id>
 *       List all category references for an actor
 *
 *   get-object <actor_id>
 *       Get the full intelligence object
 *
 *   get-version <actor_id>
 *       Get the version for an actor
 *
 *   create-session <session_id> <agent_id> <purpose> <categories> <scopes> <uses> <ttl>
 *       Create a session request
 *
 *   approve-session <session_id> <expires_at> <remaining_uses>
 *       Approve a session
 *
 *   get-session <actor_id> <session_id>
 *       Get a session
 *
 * Environment Variables:
 *   MOI_MNEMONIC - Your wallet mnemonic phrase (required)
 *   MOI_DEVNET_RPC - Custom RPC endpoint (optional)
 *   MOI_INTELLIGENCE_LOGIC_ID - Logic ID (optional if deployment-devnet.json exists)
 */

import { Wallet, JsonRpcProvider, getLogicDriver } from 'js-moi-sdk';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_DEVNET_RPC = 'https://dev.voyage-rpc.moi.technology/devnet';
const DERIVATION_PATH = "m/44'/6174'/7020'/0/0";

interface Context {
  wallet: Wallet;
  provider: JsonRpcProvider;
  driver: any;
  address: string;
}

async function getLogicId(): Promise<string> {
  if (process.env.MOI_INTELLIGENCE_LOGIC_ID) {
    return process.env.MOI_INTELLIGENCE_LOGIC_ID;
  }

  const deploymentPath = path.join(__dirname, '../contract/deployment-devnet.json');
  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
    if (deployment.logicId) {
      return deployment.logicId;
    }
  }

  throw new Error('Logic ID not found. Set MOI_INTELLIGENCE_LOGIC_ID or run deploy-devnet.ts first.');
}

async function initContext(): Promise<Context> {
  const mnemonic = process.env.MOI_MNEMONIC;
  if (!mnemonic) {
    throw new Error('MOI_MNEMONIC environment variable is required.');
  }

  const wallet = await Wallet.fromMnemonic(mnemonic, DERIVATION_PATH);
  const rpcUrl = process.env.MOI_DEVNET_RPC || DEFAULT_DEVNET_RPC;
  const provider = new JsonRpcProvider(rpcUrl);
  wallet.connect(provider);

  const logicId = await getLogicId();
  const driver = await getLogicDriver(logicId, wallet);
  const identifier = await wallet.getIdentifier();

  return {
    wallet,
    provider,
    driver,
    address: identifier.toHex(),
  };
}

async function setCategory(ctx: Context, category: string, ref: string, schemaVersion: string): Promise<void> {
  console.log(`Setting category ${category}...`);
  const updatedAt = BigInt(Math.floor(Date.now() / 1000));

  const ix = await ctx.driver.routines.SetCategoryRef(category, ref, schemaVersion, updatedAt);
  console.log(`TX Hash: ${ix.hash}`);

  console.log('Waiting for confirmation...');
  await ix.wait();
  console.log('Category set successfully!');
}

async function getCategory(ctx: Context, actorId: string, category: string): Promise<void> {
  console.log(`Getting category ${category} for ${actorId}...`);
  const result = await ctx.driver.routines.GetCategoryRef(actorId, category);
  console.log('Result:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

async function listCategories(ctx: Context, actorId: string): Promise<void> {
  console.log(`Listing categories for ${actorId}...`);
  const result = await ctx.driver.routines.ListCategoryRefs(actorId);
  console.log('Result:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

async function getObject(ctx: Context, actorId: string): Promise<void> {
  console.log(`Getting intelligence object for ${actorId}...`);
  // Pass hex string directly - SDK converts to bytes internally
  const result = await ctx.driver.routines.GetIntelligenceObject(actorId);
  console.log('Result:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

async function getVersion(ctx: Context, actorId: string): Promise<void> {
  console.log(`Getting version for ${actorId}...`);
  // Pass hex string directly - SDK converts to bytes internally
  const result = await ctx.driver.routines.GetVersion(actorId);
  console.log('Version:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

async function createSession(
  ctx: Context,
  sessionId: string,
  agentId: string,
  purpose: string,
  categories: string,
  scopes: string,
  requestedUses: string,
  ttlSeconds: string
): Promise<void> {
  console.log(`Creating session ${sessionId}...`);

  const categoriesList = categories.split(',').filter((c) => c.length > 0);
  const scopesList = scopes.split(',').filter((s) => s.length > 0);

  const ix = await ctx.driver.routines.CreateSessionRequest(
    sessionId,
    agentId,
    purpose,
    categoriesList,
    scopesList,
    BigInt(requestedUses),
    BigInt(ttlSeconds),
    '' // approval ref
  );

  console.log(`TX Hash: ${ix.hash}`);
  console.log('Waiting for confirmation...');
  await ix.wait();
  console.log('Session created successfully!');
}

async function approveSession(
  ctx: Context,
  sessionId: string,
  expiresAt: string,
  remainingUses: string
): Promise<void> {
  console.log(`Approving session ${sessionId}...`);

  const issuedAt = BigInt(Math.floor(Date.now() / 1000));

  const ix = await ctx.driver.routines.ApproveSession(
    sessionId,
    issuedAt,
    BigInt(expiresAt),
    BigInt(remainingUses),
    '' // approval ref
  );

  console.log(`TX Hash: ${ix.hash}`);
  console.log('Waiting for confirmation...');
  await ix.wait();
  console.log('Session approved successfully!');
}

async function getSession(ctx: Context, actorId: string, sessionId: string): Promise<void> {
  console.log(`Getting session ${sessionId} for ${actorId}...`);
  const result = await ctx.driver.routines.GetSession(actorId, sessionId);
  console.log('Result:', JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

function printUsage(): void {
  console.log(`
Intelligence Contract CLI

Usage: npx tsx scripts/interact-devnet.ts <command> [args...]

Commands:
  set-category <category> <ref> <schema_version>
      Set a category reference (FOOD, HEALTH, ADDRESS, PAYMENT)
      Example: npx tsx scripts/interact-devnet.ts set-category FOOD ipfs://... v1.0

  get-category <actor_id> <category>
      Get a category reference
      Example: npx tsx scripts/interact-devnet.ts get-category 0x123... FOOD

  list-categories <actor_id>
      List all category references for an actor

  get-object <actor_id>
      Get the full intelligence object

  get-version <actor_id>
      Get the version for an actor

  create-session <session_id> <agent_id> <purpose> <categories> <scopes> <uses> <ttl>
      Create a session request
      Example: npx tsx scripts/interact-devnet.ts create-session sess-1 agent-1 "Food ordering" FOOD,PAYMENT read,write 100 3600

  approve-session <session_id> <expires_at> <remaining_uses>
      Approve a session
      Example: npx tsx scripts/interact-devnet.ts approve-session sess-1 1735689600 100

  get-session <actor_id> <session_id>
      Get a session

Environment Variables:
  MOI_MNEMONIC - Your wallet mnemonic phrase (required)
  MOI_DEVNET_RPC - Custom RPC endpoint (optional)
  MOI_INTELLIGENCE_LOGIC_ID - Logic ID (optional if deployment-devnet.json exists)
`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return;
  }

  const ctx = await initContext();
  console.log(`Wallet: ${ctx.address}\n`);

  switch (command) {
    case 'set-category':
      if (args.length < 3) {
        console.error('Usage: set-category <category> <ref> <schema_version>');
        process.exit(1);
      }
      await setCategory(ctx, args[0], args[1], args[2]);
      break;

    case 'get-category':
      if (args.length < 2) {
        console.error('Usage: get-category <actor_id> <category>');
        process.exit(1);
      }
      await getCategory(ctx, args[0], args[1]);
      break;

    case 'list-categories':
      if (args.length < 1) {
        console.error('Usage: list-categories <actor_id>');
        process.exit(1);
      }
      await listCategories(ctx, args[0]);
      break;

    case 'get-object':
      if (args.length < 1) {
        console.error('Usage: get-object <actor_id>');
        process.exit(1);
      }
      await getObject(ctx, args[0]);
      break;

    case 'get-version':
      if (args.length < 1) {
        console.error('Usage: get-version <actor_id>');
        process.exit(1);
      }
      await getVersion(ctx, args[0]);
      break;

    case 'create-session':
      if (args.length < 7) {
        console.error('Usage: create-session <session_id> <agent_id> <purpose> <categories> <scopes> <uses> <ttl>');
        process.exit(1);
      }
      await createSession(ctx, args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
      break;

    case 'approve-session':
      if (args.length < 3) {
        console.error('Usage: approve-session <session_id> <expires_at> <remaining_uses>');
        process.exit(1);
      }
      await approveSession(ctx, args[0], args[1], args[2]);
      break;

    case 'get-session':
      if (args.length < 2) {
        console.error('Usage: get-session <actor_id> <session_id>');
        process.exit(1);
      }
      await getSession(ctx, args[0], args[1]);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});