/**
 * Validation Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getIntelligenceParamsSchema,
  getCategoriesBodySchema,
  getSessionParamsSchema,
  validateSessionBodySchema,
  prepareWriteBodyBaseSchema,
  submitWriteBodySchema,
  getWriteStatusParamsSchema,
  updateCategoryRefParamsSchema,
} from '../../src/validation/schemas.js';

describe('Validation Schemas', () => {
  describe('getIntelligenceParamsSchema', () => {
    it('should accept valid participantId', () => {
      const result = getIntelligenceParamsSchema.safeParse({
        participantId: 'participant_001',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty participantId', () => {
      const result = getIntelligenceParamsSchema.safeParse({
        participantId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getCategoriesBodySchema', () => {
    it('should accept valid request', () => {
      const result = getCategoriesBodySchema.safeParse({
        participantId: 'participant_001',
        categories: ['FOOD', 'HEALTH'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid category', () => {
      const result = getCategoriesBodySchema.safeParse({
        participantId: 'participant_001',
        categories: ['INVALID'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty categories array', () => {
      const result = getCategoriesBodySchema.safeParse({
        participantId: 'participant_001',
        categories: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateSessionBodySchema', () => {
    it('should accept valid request', () => {
      const result = validateSessionBodySchema.safeParse({
        participantId: 'participant_001',
        agentId: 'openclaw_whatsapp_bot',
        sessionId: 'sess_123',
        requiredCategories: ['FOOD'],
        requiredScopes: ['preferences.food.read'],
        currentTime: 1773162300,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing sessionId', () => {
      const result = validateSessionBodySchema.safeParse({
        participantId: 'participant_001',
        agentId: 'openclaw_whatsapp_bot',
        requiredCategories: ['FOOD'],
        requiredScopes: ['preferences.food.read'],
        currentTime: 1773162300,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('prepareWriteBodyBaseSchema', () => {
    it('should accept valid request', () => {
      const result = prepareWriteBodyBaseSchema.safeParse({
        requestId: 'req_123',
        participantId: 'participant_001',
        action: 'update_category_ref',
        params: {
          category: 'FOOD',
          ref: 'bafy_new_cid',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid action', () => {
      const result = prepareWriteBodyBaseSchema.safeParse({
        requestId: 'req_123',
        participantId: 'participant_001',
        action: 'invalid_action',
        params: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateCategoryRefParamsSchema', () => {
    it('should accept valid params', () => {
      const result = updateCategoryRefParamsSchema.safeParse({
        category: 'FOOD',
        ref: 'bafy_new_cid',
        schemaVersion: '1.0',
        updatedAt: 1773162200,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid category', () => {
      const result = updateCategoryRefParamsSchema.safeParse({
        category: 'INVALID',
        ref: 'bafy_new_cid',
        schemaVersion: '1.0',
        updatedAt: 1773162200,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('submitWriteBodySchema', () => {
    it('should accept valid request', () => {
      const result = submitWriteBodySchema.safeParse({
        requestId: 'req_123',
        participantId: 'participant_001',
        action: 'update_category_ref',
        signedIx: {
          ix_args: '0x1234567890abcdef',
          signatures: '0xsignedpayload123',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing signedIx', () => {
      const result = submitWriteBodySchema.safeParse({
        requestId: 'req_123',
        participantId: 'participant_001',
        action: 'update_category_ref',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getWriteStatusParamsSchema', () => {
    it('should accept valid txHash', () => {
      const result = getWriteStatusParamsSchema.safeParse({
        txHash: '0xabc123def456',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid txHash format', () => {
      const result = getWriteStatusParamsSchema.safeParse({
        txHash: 'not-a-hex-string',
      });
      expect(result.success).toBe(false);
    });
  });
});
