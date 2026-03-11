/**
 * Service Layer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntelligenceService } from '../../src/services/intelligence/index.js';
import { SessionsService } from '../../src/services/sessions/index.js';
import { WritesService } from '../../src/services/writes/index.js';
import { MockMoiSdkAdapter, mockStore } from '../../src/adapters/moi-sdk/mock.js';
import { getCurrentTimestamp } from '../../src/utils/index.js';

describe('IntelligenceService', () => {
  let service: IntelligenceService;
  let adapter: MockMoiSdkAdapter;

  beforeEach(() => {
    mockStore.reset();
    adapter = new MockMoiSdkAdapter();
    service = new IntelligenceService(adapter);
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
  let adapter: MockMoiSdkAdapter;

  beforeEach(() => {
    mockStore.reset();
    adapter = new MockMoiSdkAdapter();
    service = new SessionsService(adapter);
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

  describe('ensureSession', () => {
    it('should return approved for existing valid session', async () => {
      const result = await service.ensureSession({
        participantId: 'participant_001',
        agentId: 'openclaw_whatsapp_bot',
        purpose: 'food_ordering',
        requiredCategories: ['FOOD'],
        requiredScopes: ['preferences.food.read'],
        requestedUses: 3,
        ttlSeconds: 1800,
      });

      expect(result.status).toBe('approved');
      if (result.status === 'approved') {
        expect(result.sessionId).toBe('sess_existing_001');
      }
    });

    it('should return pending_signature when no valid session exists', async () => {
      const result = await service.ensureSession({
        participantId: 'participant_002',
        agentId: 'new_agent',
        purpose: 'new_purpose',
        requiredCategories: ['ADDRESS'],
        requiredScopes: ['profile.address.read'],
        requestedUses: 5,
        ttlSeconds: 1800,
      });

      expect(result.status).toBe('pending_signature');
      if (result.status === 'pending_signature') {
        expect(result.sessionId).toMatch(/^sess_/);
        expect(result.message).toContain('ADDRESS');
        expect(result.writeRequest.action).toBe('create_session_request');
      }
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
  let adapter: MockMoiSdkAdapter;

  beforeEach(() => {
    mockStore.reset();
    adapter = new MockMoiSdkAdapter();
    service = new WritesService(adapter);
  });

  describe('prepareWrite', () => {
    it('should prepare update_category_ref write', async () => {
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
      expect(result.contract).toBe('ParticipantIntelligenceEngine');
      expect(result.method).toBe('SetCategoryRef');
      expect(result.summary).toContain('FOOD');
      expect(result.signingDigest).toMatch(/^0x/);
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
    it('should submit valid write', async () => {
      // First prepare
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

      // Then submit
      const result = await service.submitWrite({
        requestId: prepared.requestId,
        participantId: 'participant_001',
        action: 'update_category_ref',
        payload: prepared.payload,
        signature: '0x1234567890abcdef',
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
