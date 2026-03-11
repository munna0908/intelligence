/**
 * Category/Scope Mapping Tests
 */

import { describe, it, expect } from 'vitest';
import { CATEGORIES, CATEGORY_SCOPE_MAP } from '../../src/domain/types.js';

describe('Category/Scope Mapping', () => {
  it('should have all categories defined', () => {
    expect(CATEGORIES).toContain('FOOD');
    expect(CATEGORIES).toContain('HEALTH');
    expect(CATEGORIES).toContain('ADDRESS');
    expect(CATEGORIES).toContain('PAYMENT');
    expect(CATEGORIES.length).toBe(4);
  });

  it('should map FOOD to preferences.food.read', () => {
    expect(CATEGORY_SCOPE_MAP.FOOD).toBe('preferences.food.read');
  });

  it('should map HEALTH to health.read', () => {
    expect(CATEGORY_SCOPE_MAP.HEALTH).toBe('health.read');
  });

  it('should map ADDRESS to profile.address.read', () => {
    expect(CATEGORY_SCOPE_MAP.ADDRESS).toBe('profile.address.read');
  });

  it('should map PAYMENT to finance.payment.read', () => {
    expect(CATEGORY_SCOPE_MAP.PAYMENT).toBe('finance.payment.read');
  });

  it('should have mapping for all categories', () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_SCOPE_MAP[category]).toBeDefined();
      expect(typeof CATEGORY_SCOPE_MAP[category]).toBe('string');
    }
  });
});
