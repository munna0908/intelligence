/**
 * MOI Provider Configuration
 *
 * Initializes and exports the JsonRpcProvider singleton for MOI network interactions.
 */

import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

// MOI SDK types (approximations based on SDK documentation)
export type JsonRpcProvider = {
  getInteractionReceipt(hash: string): Promise<InteractionReceipt | null>;
};

export type InteractionReceipt = {
  hash: string;
  status: number | string | boolean;
  ix_operations?: Array<{ data?: Record<string, unknown> }>;
};

export type LogicDriver = {
  routines: Record<string, (...args: unknown[]) => RoutineBuilder>;
  persistentState: {
    get(key: string, ...args: unknown[]): Promise<unknown>;
  };
};

export type RoutineBuilder = {
  call(): Promise<unknown>;
  send(): Promise<{ hash: string; wait(): Promise<InteractionReceipt> }>;
};

export type Signer = {
  connect(provider: JsonRpcProvider): Signer;
};

// Dynamic SDK loading
let JsonRpcProviderClass: (new (url: string) => JsonRpcProvider) | null = null;
let getLogicDriverFn: ((logicId: string, signer: Signer) => Promise<LogicDriver>) | null = null;
let WalletClass: (new () => Signer) | null = null;

let sdkLoaded = false;

/**
 * Load MOI SDK modules dynamically
 */
export async function loadMoiSdk(): Promise<void> {
  if (sdkLoaded) return;

  const logger = getLogger();

  try {
    const sdk = await import('js-moi-sdk');
    JsonRpcProviderClass = sdk.JsonRpcProvider as unknown as typeof JsonRpcProviderClass;

    const logic = await import('js-moi-logic');
    getLogicDriverFn = logic.getLogicDriver as unknown as typeof getLogicDriverFn;

    const wallet = await import('js-moi-wallet');
    WalletClass = wallet.Wallet as unknown as typeof WalletClass;

    sdkLoaded = true;
    logger.info('MOI SDK loaded successfully');
  } catch (error) {
    logger.warn({ error }, 'MOI SDK not available - using mock adapter');
  }
}

/**
 * Check if MOI SDK is loaded
 */
export function isSdkLoaded(): boolean {
  return sdkLoaded;
}

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

  await loadMoiSdk();

  if (!JsonRpcProviderClass) {
    throw new Error(
      'MOI SDK not installed. Run: npm install js-moi-sdk js-moi-logic js-moi-wallet'
    );
  }

  const logicId = config.moi.intelligenceLogicId;
  if (!logicId) {
    throw new Error(
      'MOI_INTELLIGENCE_LOGIC_ID is not configured. Deploy the Intelligence contract first.'
    );
  }

  logger.info(
    { networkUrl: config.moi.networkUrl, logicId },
    'Initializing MOI provider and logic driver'
  );

  // Create provider
  providerInstance = new JsonRpcProviderClass(config.moi.networkUrl);

  // Create wallet and connect to provider
  if (!WalletClass || !getLogicDriverFn) {
    throw new Error('MOI SDK not properly loaded');
  }

  const wallet = new WalletClass();
  const connectedWallet = wallet.connect(providerInstance);

  // Initialize logic driver
  logicDriverInstance = await getLogicDriverFn(logicId, connectedWallet);

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
