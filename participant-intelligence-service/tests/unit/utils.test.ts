/**
 * Utility Function Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateRequestId,
  generateSessionId,
  generateNonce,
  generateTxHash,
  computeSigningDigest,
  getCurrentTimestamp,
  isSubset,
  truncateForLogging,
} from '../../src/utils/index.js';

describe('Utility Functions', () => {
  describe('generateRequestId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });

    it('should start with req_ prefix', () => {
      const id = generateRequestId();
      expect(id.startsWith('req_')).toBe(true);
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });

    it('should start with sess_ prefix', () => {
      const id = generateSessionId();
      expect(id.startsWith('sess_')).toBe(true);
    });
  });

  describe('generateNonce', () => {
    it('should generate unique nonces', () => {
      const n1 = generateNonce();
      const n2 = generateNonce();
      expect(n1).not.toBe(n2);
    });

    it('should start with nonce_ prefix', () => {
      const nonce = generateNonce();
      expect(nonce.startsWith('nonce_')).toBe(true);
    });
  });

  describe('generateTxHash', () => {
    it('should generate unique hashes', () => {
      const h1 = generateTxHash();
      const h2 = generateTxHash();
      expect(h1).not.toBe(h2);
    });

    it('should start with 0x prefix', () => {
      const hash = generateTxHash();
      expect(hash.startsWith('0x')).toBe(true);
    });

    it('should be 66 characters (0x + 64 hex)', () => {
      const hash = generateTxHash();
      expect(hash.length).toBe(66);
    });
  });

  describe('computeSigningDigest', () => {
    it('should produce consistent digest for same payload', () => {
      const payload = { a: 1, b: 2 };
      const d1 = computeSigningDigest(payload);
      const d2 = computeSigningDigest(payload);
      expect(d1).toBe(d2);
    });

    it('should produce different digests for different payloads', () => {
      const d1 = computeSigningDigest({ a: 1 });
      const d2 = computeSigningDigest({ a: 2 });
      expect(d1).not.toBe(d2);
    });

    it('should start with 0x prefix', () => {
      const digest = computeSigningDigest({ test: true });
      expect(digest.startsWith('0x')).toBe(true);
    });

    it('should produce same digest regardless of key order', () => {
      const d1 = computeSigningDigest({ a: 1, b: 2 });
      const d2 = computeSigningDigest({ b: 2, a: 1 });
      expect(d1).toBe(d2);
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return a number', () => {
      const ts = getCurrentTimestamp();
      expect(typeof ts).toBe('number');
    });

    it('should return seconds (not milliseconds)', () => {
      const ts = getCurrentTimestamp();
      // Should be a reasonable Unix timestamp in seconds (> 2020)
      expect(ts).toBeGreaterThan(1577836800);
      // Should be less than year 2100 timestamp
      expect(ts).toBeLessThan(4102444800);
    });
  });

  describe('isSubset', () => {
    it('should return true for empty subset', () => {
      expect(isSubset([], ['a', 'b'])).toBe(true);
    });

    it('should return true when subset equals superset', () => {
      expect(isSubset(['a', 'b'], ['a', 'b'])).toBe(true);
    });

    it('should return true for proper subset', () => {
      expect(isSubset(['a'], ['a', 'b', 'c'])).toBe(true);
    });

    it('should return false when element missing from superset', () => {
      expect(isSubset(['a', 'x'], ['a', 'b', 'c'])).toBe(false);
    });

    it('should return false for disjoint sets', () => {
      expect(isSubset(['x', 'y'], ['a', 'b'])).toBe(false);
    });
  });

  describe('truncateForLogging', () => {
    it('should not truncate short strings', () => {
      expect(truncateForLogging('short')).toBe('short');
    });

    it('should truncate long strings', () => {
      const long = 'a'.repeat(50);
      const result = truncateForLogging(long, 20);
      expect(result).toBe('aaaaaaaaaaaaaaaaaaaa...');
      expect(result.length).toBe(23); // 20 + '...'
    });

    it('should use default max length of 20', () => {
      const long = 'a'.repeat(30);
      const result = truncateForLogging(long);
      expect(result.length).toBe(23);
    });
  });
});
