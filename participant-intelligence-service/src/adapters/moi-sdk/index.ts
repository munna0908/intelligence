/**
 * MOI SDK Adapter Factory
 *
 * Creates the appropriate MOI SDK adapter based on configuration.
 */

import type { IMoiSdkAdapter } from './interface.js';
import { MockMoiSdkAdapter } from './mock.js';
import { RealMoiSdkAdapter } from './real.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

export type { IMoiSdkAdapter, PreparedWrite, SubmitWriteResult, SessionValidationResult } from './interface.js';
export { MockMoiSdkAdapter } from './mock.js';
export { RealMoiSdkAdapter } from './real.js';

// Singleton adapter instance
let adapterInstance: IMoiSdkAdapter | null = null;

/**
 * Create and return the MOI SDK adapter based on configuration
 */
export function createMoiSdkAdapter(): IMoiSdkAdapter {
  const config = getConfig();
  const logger = getLogger();

  if (config.moi.useMockAdapter) {
    logger.info('Using Mock MOI SDK Adapter');
    return new MockMoiSdkAdapter();
  }

  logger.info({ networkUrl: config.moi.networkUrl }, 'Using Real MOI SDK Adapter');
  return new RealMoiSdkAdapter();
}

/**
 * Get the singleton MOI SDK adapter instance
 */
export function getMoiSdkAdapter(): IMoiSdkAdapter {
  if (!adapterInstance) {
    adapterInstance = createMoiSdkAdapter();
  }
  return adapterInstance;
}

/**
 * Reset the adapter instance (useful for testing)
 */
export function resetMoiSdkAdapter(): void {
  adapterInstance = null;
}

/**
 * Set a specific adapter instance (useful for testing)
 */
export function setMoiSdkAdapter(adapter: IMoiSdkAdapter): void {
  adapterInstance = adapter;
}
