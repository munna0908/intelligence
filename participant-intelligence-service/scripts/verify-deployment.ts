#!/usr/bin/env tsx
import 'dotenv-flow/config';

/**
 * Verify Intelligence Logic Deployment
 *
 * This script verifies that the deployed Intelligence logic is accessible
 * by checking the transaction receipt and ix_ops status.
 *
 * Usage:
 *   npx tsx scripts/verify-deployment.ts [tx_hash]
 *
 * Environment Variables:
 *   MOI_MNEMONIC - Your wallet mnemonic phrase (required)
 */

import { Wallet, VoyageProvider, getLogicDriver, hexToBytes, Schema } from 'js-moi-sdk';
import { Depolorizer } from 'js-polo';
import * as fs from 'fs';
import * as path from 'path';

const DERIVATION_PATH = "m/44'/6174'/7020'/0/0";

async function getDeploymentInfo(): Promise<{ txHash: string; logicId: string }> {
  // Check command line argument first
  if (process.argv[2]) {
    return { txHash: process.argv[2], logicId: '' };
  }

  // Try to read from deployment file
  const deploymentPath = path.join(__dirname, '../contract/deployment-devnet.json');

  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
    return {
      txHash: deployment.txHash || '',
      logicId: deployment.logicId || '',
    };
  }

  throw new Error(
    'Deployment info not found.\n' +
      'Usage: npx tsx scripts/verify-deployment.ts <tx_hash>\n' +
      'Or run deploy-devnet.ts first'
  );
}

async function main(): Promise<void> {
  console.log('======================================');
  console.log('Verifying Intelligence Logic Deployment');
  console.log('======================================\n');

  try {
    const mnemonic = process.env.MOI_MNEMONIC;
    if (!mnemonic) {
      throw new Error('MOI_MNEMONIC environment variable is required.');
    }

    const wallet = await Wallet.fromMnemonic(mnemonic, DERIVATION_PATH);
    const provider = new VoyageProvider('devnet');
    wallet.connect(provider);

    const identifier = await wallet.getIdentifier();
    console.log(`Wallet: ${identifier.toHex()}\n`);

    const { txHash, logicId } = await getDeploymentInfo();

    if (txHash) {
      console.log(`Transaction Hash: ${txHash}\n`);

      // Get receipt and check ix_ops status
      const receipt = await provider.getInteractionReceipt(txHash);

      console.log('Receipt Status:', receipt.status === 0 ? 'SUCCESS' : 'FAILED');
      console.log('\nInteraction Operations:');

      const ixOps = receipt.ix_operations || [];
      for (let i = 0; i < ixOps.length; i++) {
        const op = ixOps[i];
        const status = op.status === 0 ? '✅ SUCCESS' : '❌ FAILED';
        console.log(`  [${i}] Type: ${op.tx_type}, Status: ${status}`);

        // If failed, decode the error
        if (op.status !== 0 && op.data) {
          try {
            const errorHex = typeof op.data === 'string' ? op.data : JSON.stringify(op.data);
            if (errorHex.startsWith('0x')) {
              const data = hexToBytes(errorHex);
              const depolorizer = new Depolorizer(data);
              const decoded = depolorizer.depolorize(Schema.PISA_EXCEPTION_SCHEMA);
              console.log('     Error:', JSON.stringify(decoded, null, 2));
            }
          } catch {
            console.log('     Error data:', op.data);
          }
        }
      }

      // Extract logic ID from participants if not provided
      let foundLogicId = logicId;
      if (!foundLogicId) {
        const participants = (receipt as any).participants || [];
        for (const p of participants) {
          const participantId = p.id || p.address || p.participant_id;
          if (participantId?.startsWith('0x20') && p.height === '0x0') {
            foundLogicId = participantId;
            break;
          }
        }
      }

      if (foundLogicId) {
        console.log(`\nLogic ID: ${foundLogicId}`);

        // Try to verify the logic is accessible
        console.log('\nVerifying logic accessibility...');
        try {
          const driver = await getLogicDriver(foundLogicId, wallet);
          console.log('✅ Logic is accessible!');
          console.log('Available routines:', Object.keys(driver.routines).join(', '));
        } catch (e) {
          console.log('⚠️  Logic not yet accessible:', (e as Error).message);
          console.log('   (May still be propagating on the network)');
        }
      }
    }

    console.log('\n======================================');
    console.log('VERIFICATION COMPLETE');
    console.log('======================================');
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();