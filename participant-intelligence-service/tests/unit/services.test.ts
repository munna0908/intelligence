/**
 * Service Layer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntelligenceService } from '../../src/services/intelligence.service.js';
import { SessionsService } from '../../src/services/sessions.service.js';
import { WritesService } from '../../src/services/writes.service.js';
import { mockStore } from '../../src/moi/interface/mock.interface.js';
import { getCurrentTimestamp } from '../../src/utils/index.js';

describe('IntelligenceService', () => {
  let service: IntelligenceService;

  beforeEach(() => {
    mockStore.reset();
    service = new IntelligenceService();
  });

  describe('getIntelligenceObject', () => {
    it('should return intelligence object for existing participant', async () => {
      const result = await service.getIntelligenceObject('participant_001');

      expect(result).not.toBeNull();
      expect(result?.participantId).toBe('participant_001');
    });

    it('should return null for non-existent participant', async () => {
      const result = await service.getIntelligenceObject('non_existent');
      expect(result).toBeNull();
    });
  });

  describe('getCategoryRefs', () => {
    it('should return category refs response', async () => {
      const result = await service.getCategoryRefs('participant_001', ['FOOD', 'HEALTH']);

      expect(result.participantId).toBe('participant_001');
      expect(result.categoryRefs.FOOD).toBeDefined();
      expect(result.categoryRefs.HEALTH).toBeDefined();
    });
  });
});

describe('SessionsService', () => {
  let service: SessionsService;

  beforeEach(() => {
    mockStore.reset();
    service = new SessionsService();
  });

  describe('getSession', () => {
    it('should return session for existing session', async () => {
      const result = await service.getSession('participant_001', 'sess_existing_001');

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('sess_existing_001');
    });

    it('should return null for non-existent session', async () => {
      const result = await service.getSession('participant_001', 'non_existent');
      expect(result).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('should return valid for valid session', async () => {
      const result = await service.validateSession({
        participantId: 'participant_001',
        agentId: 'openclaw_whatsapp_bot',
        sessionId: 'sess_existing_001',
        requiredCategories: ['FOOD'],
        requiredScopes: ['preferences.food.read'],
        currentTime: getCurrentTimestamp(),
      });

      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should return invalid with reason for invalid session', async () => {
      const result = await service.validateSession({
        participantId: 'participant_001',
        agentId: 'wrong_agent',
        sessionId: 'sess_existing_001',
        requiredCategories: ['FOOD'],
        requiredScopes: ['preferences.food.read'],
        currentTime: getCurrentTimestamp(),
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_mismatch');
    });
  });
});

describe('WritesService', () => {
  let service: WritesService;

  beforeEach(() => {
    mockStore.reset();
    service = new WritesService();
  });

  describe('prepareWrite', () => {
    it('should prepare update_category_ref write and return ixObject', async () => {
      const result = await service.prepareWrite({
        requestId: 'req_test',
        participantId: 'participant_001',
        action: 'update_category_ref',
        params: {
          category: 'FOOD',
          ref: 'bafy_new_cid',
          schemaVersion: '1.0',
          updatedAt: getCurrentTimestamp(),
        },
      });

      expect(result.requestId).toBe('req_test');
      expect(result.status).toBe('ready_to_sign');
      expect(result.action).toBe('update_category_ref');
      expect(result.method).toBe('SetCategoryRef');
      expect(result.summary).toContain('FOOD');
      expect(result.ixObject).toBeDefined();
      expect(result.ixObject.sender).toBeDefined();
      expect(result.ixObject.ix_operations).toHaveLength(1);
      expect(result.expiresAt).toBeGreaterThan(getCurrentTimestamp());
    });

    it('should reject invalid params', async () => {
      await expect(
        service.prepareWrite({
          requestId: 'req_test',
          participantId: 'participant_001',
          action: 'update_category_ref',
          params: {
            category: 'INVALID',
            ref: 'bafy_cid',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('submitWrite', () => {
    it('should submit valid signed interaction', async () => {
      // First prepare to get the ixObject
      const prepared = await service.prepareWrite({
        requestId: 'req_test',
        participantId: 'participant_001',
        action: 'update_category_ref',
        params: {
          category: 'FOOD',
          ref: 'bafy_new_cid',
          schemaVersion: '1.0',
          updatedAt: getCurrentTimestamp(),
        },
      });

      // Client would sign prepared.ixObject with their wallet — mock with fake InteractionRequest
      const result = await service.submitWrite({
        requestId: prepared.requestId,
        participantId: 'participant_001',
        action: 'update_category_ref',
        signedIx: {
          ix_args: '0x0123456789abcdef',
          signatures: '0xabcdef0123456789',
        },
      });

      expect(result.requestId).toBe('req_test');
      expect(result.status).toBe('submitted');
      expect(result.txHash).toMatch(/^0x/);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return transaction status', async () => {
      const result = await service.getTransactionStatus('0xtest123');

      expect(result.txHash).toBe('0xtest123');
      expect(['pending', 'confirmed', 'failed']).toContain(result.status);
    });
  });
});
