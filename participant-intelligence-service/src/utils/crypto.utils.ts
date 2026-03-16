/**
 * Cryptographic and ID generation utility functions
 */

import { createHash, randomBytes } from 'crypto';

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${randomBytes(8).toString('hex')}`;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `sess_${randomBytes(8).toString('hex')}`;
}

/**
 * Generate a unique nonce for transactions
 */
export function generateNonce(): string {
  return `nonce_${randomBytes(8).toString('hex')}`;
}

/**
 * Generate a mock transaction hash
 */
export function generateTxHash(): string {
  return `0x${randomBytes(32).toString('hex')}`;
}

/**
 * Compute a signing digest from a payload
 * In production, this would use the MOI SDK's serialization
 */
export function computeSigningDigest(payload: object): string {
  const canonicalJson = JSON.stringify(payload, Object.keys(payload).sort());
  const hash = createHash('sha256').update(canonicalJson).digest('hex');
  return `0x${hash.slice(0, 64)}`;
}

/**
 * Get current Unix timestamp in seconds
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Check if a set is a subset of another set
 */
export function isSubset<T>(subset: T[], superset: T[]): boolean {
  const supersetSet = new Set(superset);
  return subset.every((item) => supersetSet.has(item));
}

/**
 * Truncate a string for safe logging
 */
export function truncateForLogging(value: string, maxLength = 20): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}
