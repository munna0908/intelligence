/**
 * MOI Provider Configuration
 *
 * Initializes and exports the provider and logic driver for MOI network interactions.
 *
 * NOTE: This service does NOT use a server wallet. All transactions are signed by users.
 * The LogicDriver is initialized with just a provider for read-only operations.
 */

import { JsonRpcProvider, LogicDriver } from 'js-moi-sdk';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

// Singleton instances
let providerInstance: JsonRpcProvider | null = null;
let logicDriverInstance: any = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the JsonRpcProvider singleton
 */
export async function getProvider(): Promise<JsonRpcProvider> {
  await ensureInitialized();
  return providerInstance!;
}

/**
 * Get the LogicDriver singleton (read-only, no wallet)
 */
export async function getLogicDriver(): Promise<any> {
  await ensureInitialized();
  return logicDriverInstance;
}

/**
 * Initialize provider and logic driver
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

  logger.info(
    { networkUrl: config.moi.networkUrl, logicId },
    'Initializing MOI provider and logic driver (read-only, no wallet)'
  );

  // Create provider
  providerInstance = new JsonRpcProvider(config.moi.networkUrl);

  // Fetch manifest directly using provider
  const manifest = await providerInstance.getLogicManifest(logicId, 'JSON');

  if (typeof manifest !== 'object') {
    throw new Error('Failed to fetch logic manifest');
  }

  // Initialize logic driver with provider only (no wallet)
  // The LogicDriver.connect() method accepts either Signer or Provider
  logicDriverInstance = new LogicDriver(logicId, manifest, providerInstance as any);

  logger.info({ logicId }, 'MOI provider and logic driver initialized (no wallet)');
}

/**
 * Reset provider instances (for testing)
 */
export function resetProvider(): void {
  providerInstance = null;
  logicDriverInstance = null;
  initPromise = null;
}
