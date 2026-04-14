#!/usr/bin/env tsx
import 'dotenv-flow/config';

/**
 * Deploy Intelligence Logic to MOI Public Devnet
 *
 * This script deploys the compiled Intelligence.coco contract to the MOI public devnet.
 *
 * Prerequisites:
 * 1. Set MOI_MNEMONIC environment variable with your wallet mnemonic
 * 2. Ensure the contract is compiled (intelligence.json exists)
 * 3. Have devnet MOI tokens for gas (get from MOI faucet)
 *
 * Usage:
 *   npx tsx scripts/deploy-devnet.ts
 *
 * Environment Variables:
 *   MOI_MNEMONIC - Your wallet mnemonic phrase (required)
 *   MOI_DEVNET_RPC - Custom RPC endpoint (optional, defaults to voyage devnet)
 */

import { Wallet, VoyageProvider, JsonRpcProvider, LogicFactory, hexToBytes, Schema, ManifestCoder } from 'js-moi-sdk';
import { Depolorizer } from 'js-polo';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const DEFAULT_DEVNET_RPC = 'https://dev.voyage-rpc.moi.technology/devnet';
const DERIVATION_PATH = "m/44'/6174'/7020'/0/0";

interface DeploymentResult {
  success: boolean;
  logicId?: string;
  txHash?: string;
  error?: string;
}

async function loadManifest(): Promise<object> {
  const manifestPath = path.join(__dirname, '../contract/intelligence.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Manifest not found at ${manifestPath}. Please compile the CoCo contract first:\n` +
        '  cd contract && coco compile'
    );
  }

  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(manifestContent);
}

async function getWallet(): Promise<Wallet> {
  const mnemonic = "diary spirit praise tail vehicle dune letter day elephant check paddle fat";

  if (!mnemonic) {
    throw new Error(
      'MOI_MNEMONIC environment variable is required.\n' +
        'Set it with your wallet mnemonic phrase:\n' +
        '  export MOI_MNEMONIC="your twelve word mnemonic phrase here"'
    );
  }

  console.log('Initializing wallet from mnemonic...');
  const wallet = await Wallet.fromMnemonic(mnemonic, DERIVATION_PATH);
  return wallet;
}

function getProvider(): VoyageProvider | JsonRpcProvider {
  const rpcUrl = process.env.MOI_DEVNET_RPC;

  if (rpcUrl) {
    console.log(`Connecting to custom RPC: ${rpcUrl}`);
    return new JsonRpcProvider(rpcUrl);
  }

  console.log('Connecting to devnet via VoyageProvider...');
  return new VoyageProvider('devnet');
}

async function deployLogic(manifest: object, wallet: Wallet): Promise<DeploymentResult> {
  try {
    console.log('\nCreating LogicFactory...');
    const factory = new LogicFactory(manifest as any, wallet);

    console.log('Deploying Intelligence logic to devnet...');
    console.log('(This may take a moment...)\n');

    // Deploy the logic - new SDK returns a context, call .send() to execute
    const deployCtx = factory.deploy();
    const deployIx = await deployCtx.send();

    console.log(`Transaction submitted: ${deployIx.hash}`);
    console.log('Waiting for receipt...');

    // Wait for the receipt
    const receipt = await deployIx.wait();

    // Print receipt and ix_op status (status 0 = SUCCESS)
    console.log('\n--- Receipt ---');
    console.log(`IX Hash: ${receipt.ix_hash}`);
    console.log(`Status: ${receipt.status} (${receipt.status === 0 ? 'SUCCESS' : 'FAILED'})`);

    const ixOps = receipt.ix_operations || [];
    console.log(`\n--- IX Operations (${ixOps.length}) ---`);
    for (let i = 0; i < ixOps.length; i++) {
      const op = ixOps[i];
      console.log(`[${i}] tx_type: ${op.tx_type}, status: ${op.status} (${op.status === 0 ? 'SUCCESS' : 'FAILED'}), data: ${op.data}`);
    }

    // Check if any ix operation has error data to decode
    for (const op of ixOps) {
      if (op.data) {
        console.log('\n--- Operation Data ---');
        try {
          const errorHex = typeof op.data === 'string' ? op.data : String(op.data);
          if (errorHex && errorHex.startsWith('0x')) {
            const data = hexToBytes(errorHex);
            const depolorizer = new Depolorizer(data);
            const decoded = depolorizer.depolorize(Schema.PISA_EXCEPTION_SCHEMA);
            console.log('Decoded:', JSON.stringify(decoded, null, 2));
          }
        } catch (decodeErr) {
          console.log('Data:', op.data);
        }
      }
    }

    // Extract logic ID from participants (new account with height 0)
    let logicId: string | undefined;

    // Check if result() works
    try {
      const result = await deployIx.result();
      logicId = result.logic_id;
    } catch {
      // If result() fails, extract from receipt participants
      const participants = (receipt as any).participants || [];
      for (const p of participants) {
        // Logic accounts have specific prefix (0x20) and height 0 for new deployments
        const pId = p.id || p.address || p.participant_id;
        const pHeight = p.height;
        if (pId && pId.startsWith('0x20') && pHeight === '0x0') {
          logicId = pId;
          break;
        }
      }
    }

    if (!logicId) {
      console.log('Receipt:', JSON.stringify(receipt, null, 2));
      return {
        success: false,
        error: 'Could not extract logic ID from deployment result',
        txHash: deployIx.hash,
      };
    }

    console.log('\n========================================');
    console.log('DEPLOYMENT SUCCESSFUL!');
    console.log('========================================');
    console.log(`Logic ID: ${logicId}`);
    console.log(`TX Hash:  ${deployIx.hash}`);
    console.log('========================================\n');

    return {
      success: true,
      logicId,
      txHash: deployIx.hash,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\nDeployment failed:', errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function checkBalance(wallet: Wallet): Promise<void> {
  try {
    const identifier = await wallet.getIdentifier();
    const address = identifier.toHex();
    console.log(`Wallet address: ${address}`);
  } catch (error) {
    console.log('Could not get wallet address');
  }
}

async function main(): Promise<void> {
  console.log('======================================');
  console.log('MOI Intelligence Contract Deployment');
  console.log('Network: Public Devnet');
  console.log('======================================\n');

  try {
    // Load the compiled manifest
    console.log('Loading compiled manifest...');
    const manifest = await loadManifest();
    console.log('Manifest loaded successfully.\n');

    // Initialize wallet
    const wallet = await getWallet();

    // Connect to provider
    const provider = getProvider();
    wallet.connect(provider);

    // Check wallet address
    await checkBalance(wallet);

    // Deploy
    const result = await deployLogic(manifest, wallet);

    if (result.success && result.logicId) {
      console.log('Next steps:');
      console.log('1. Update your .env file with the Logic ID:');
      console.log(`   MOI_INTELLIGENCE_LOGIC_ID=${result.logicId}`);
      console.log('\n2. Update MOI_NETWORK_URL to point to devnet:');
      console.log('   MOI_NETWORK_URL=https://dev.voyage-rpc.moi.technology/devnet');
      console.log('\n3. Set USE_MOCK_ADAPTER=false to use the real adapter');
      console.log('\n4. Restart your service to use the deployed contract');

      // Write deployment info to a file for reference
      const deploymentInfo = {
        network: 'devnet',
        logicId: result.logicId,
        txHash: result.txHash,
        deployedAt: new Date().toISOString(),
        rpcUrl: process.env.MOI_DEVNET_RPC || DEFAULT_DEVNET_RPC,
      };

      const deploymentPath = path.join(__dirname, '../contract/deployment-devnet.json');
      fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
      console.log(`\nDeployment info saved to: ${deploymentPath}`);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();