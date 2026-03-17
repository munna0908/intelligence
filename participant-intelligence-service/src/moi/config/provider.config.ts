/**
 * MOI Provider Configuration
 *
 * Initializes and exports the JsonRpcProvider and LogicDriver singletons.
 */

import { Wallet, JsonRpcProvider, getLogicDriver as getLogicDriverSDK } from 'js-moi-sdk';
import type { LogicDriver, InteractionReceipt } from 'js-moi-sdk';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

export type { LogicDriver, InteractionReceipt };

// Singleton instances
let providerInstance: JsonRpcProvider | null = null;
let logicDriverInstance: LogicDriver | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the JsonRpcProvider singleton
 */
export async function getProvider(): Promise<JsonRpcProvider> {
  await ensureInitialized();
  return providerInstance!;
}

/**
 * Get the LogicDriver singleton
 */
export async function getLogicDriver(): Promise<LogicDriver> {
  await ensureInitialized();
  return logicDriverInstance!;
}

/**
 * Initialize provider and logic driver lazily
 */
async function ensureInitialized(): Promise<void> {
  if (logicDriverInstance) return;

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = initialize();
  await initPromise;
}

async function initialize(): Promise<void> {
  const config = getConfig();
  const logger = getLogger();

  const logicId = config.moi.intelligenceLogicId;
  if (!logicId) {
    throw new Error(
      'MOI_INTELLIGENCE_LOGIC_ID is not configured. Deploy the Intelligence contract first.'
    );
  }

  const mnemonic = config.moi.mnemonic;
  if (!mnemonic) {
    throw new Error(
      'MOI_MNEMONIC is not configured. Set your wallet mnemonic phrase.'
    );
  }

  logger.info(
    { networkUrl: config.moi.networkUrl, logicId },
    'Initializing MOI provider and logic driver'
  );

  providerInstance = new JsonRpcProvider(config.moi.networkUrl);

  const wallet = await Wallet.fromMnemonic(mnemonic, config.moi.derivationPath);
  wallet.connect(providerInstance);

  logicDriverInstance = await getLogicDriverSDK(logicId, wallet);

  logger.info({ logicId }, 'MOI provider and logic driver initialized');
}

/**
 * Reset provider instances (for testing)
 */
export function resetProvider(): void {
  providerInstance = null;
  logicDriverInstance = null;
  initPromise = null;
}
