/**
 * Mock MOI SDK Adapter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockMoiSdkAdapter, mockStore } from '../../src/adapters/moi-sdk/mock.js';
import { getCurrentTimestamp } from '../../src/utils/index.js';

describe('MockMoiSdkAdapter', () => {
  let adapter: MockMoiSdkAdapter;

  beforeEach(() => {
    mockStore.reset();
    adapter = new MockMoiSdkAdapter();
  });

  describe('getIntelligenceObject', () => {
    it('should return intelligence object for existing participant', async () => {
      const result = await adapter.getIntelligenceObject('participant_001');

      expect(result).not.toBeNull();
      expect(result?.participantId).toBe('participant_001');
      expect(result?.version).toBe('1.0');
      expect(result?.categoryRefs.FOOD).toBeDefined();
      expect(result?.categoryRefs.HEALTH).toBeDefined();
    });

    it('should return null for non-existent participant', async () => {
      const result = await adapter.getIntelligenceObject('non_existent');
      expect(result).toBeNull();
    });
  });

  describe('getCategoryRefs', () => {
    it('should return requested category refs', async () => {
      const result = await adapter.getCategoryRefs('participant_001', ['FOOD', 'HEALTH']);

      expect(result.FOOD).toBeDefined();
      expect(result.FOOD?.ref).toBe('bafy_food_cid_001');
      expect(result.HEALTH).toBeDefined();
    });

    it('should return empty for non-existent categories', async () => {
      const result = await adapter.getCategoryRefs('participant_001', ['ADDRESS', 'PAYMENT']);
      expect(result.ADDRESS).toBeUndefined();
      expect(result.PAYMENT).toBeUndefined();
    });

    it('should return empty for non-existent participant', async () => {
      const result = await adapter.getCategoryRefs('non_existent', ['FOOD']);
      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe('getSession', () => {
    it('should return session for existing session', async () => {
      const result = await adapter.getSession('participant_001', 'sess_existing_001');

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('sess_existing_001');
      expect(result?.status).toBe('ACTIVE');
      expect(result?.agentId).toBe('openclaw_whatsapp_bot');
    });

    it('should return null for non-existent session', async () => {
      const result = await adapter.getSession('participant_001', 'non_existent');
      expect(result).toBeNull();
    });
  });

  describe('findValidSession', () => {
    it('should find valid session matching requirements', async () => {
      const currentTime = getCurrentTimestamp();
      const result = await adapter.findValidSession(
        'participant_001',
        'openclaw_whatsapp_bot',
        ['FOOD'],
        ['preferences.food.read'],
        currentTime
      );

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('sess_existing_001');
    });

    it('should not find session with wrong agent', async () => {
      const currentTime = getCurrentTimestamp();
      const result = await adapter.findValidSession(
        'participant_001',
        'different_agent',
        ['FOOD'],
        ['preferences.food.read'],
        currentTime
      );

      expect(result).toBeNull();
    });

    it('should not find session missing required category', async () => {
      const currentTime = getCurrentTimestamp();
      const result = await adapter.findValidSession(
        'participant_001',
        'openclaw_whatsapp_bot',
        ['FOOD', 'PAYMENT'], // PAYMENT not in existing session
        ['preferences.food.read'],
        currentTime
      );

      expect(result).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('should validate existing active session', async () => {
      const currentTime = getCurrentTimestamp();
      const result = await adapter.validateSession(
        'participant_001',
        'sess_existing_001',
        'openclaw_whatsapp_bot',
        ['FOOD'],
        ['preferences.food.read'],
        currentTime
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should return not_found for non-existent session', async () => {
      const result = await adapter.validateSession(
        'participant_001',
        'non_existent',
        'openclaw_whatsapp_bot',
        ['FOOD'],
        ['preferences.food.read'],
        getCurrentTimestamp()
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not_found');
    });

    it('should return agent_mismatch for wrong agent', async () => {
      const result = await adapter.validateSession(
        'participant_001',
        'sess_existing_001',
        'wrong_agent',
        ['FOOD'],
        ['preferences.food.read'],
        getCurrentTimestamp()
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('agent_mismatch');
    });

    it('should return missing_category for unauthorized category', async () => {
      const result = await adapter.validateSession(
        'participant_001',
        'sess_existing_001',
        'openclaw_whatsapp_bot',
        ['FOOD', 'PAYMENT'],
        ['preferences.food.read'],
        getCurrentTimestamp()
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_category');
    });

    it('should return missing_scope for unauthorized scope', async () => {
      const result = await adapter.validateSession(
        'participant_001',
        'sess_existing_001',
        'openclaw_whatsapp_bot',
        ['FOOD'],
        ['preferences.food.read', 'finance.payment.read'],
        getCurrentTimestamp()
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_scope');
    });
  });

  describe('prepareContractWrite', () => {
    it('should prepare update_category_ref write', async () => {
      const result = await adapter.prepareContractWrite(
        'update_category_ref',
        {
          category: 'FOOD',
          ref: 'bafy_new_cid',
          schemaVersion: '1.0',
          updatedAt: getCurrentTimestamp(),
        },
        'participant_001'
      );

      expect(result.contract).toBe('ParticipantIntelligenceEngine');
      expect(result.method).toBe('SetCategoryRef');
      expect(result.signingDigest).toMatch(/^0x/);
      expect(result.payload.nonce).toMatch(/^nonce_/);
    });

    it('should prepare create_session_request write', async () => {
      const result = await adapter.prepareContractWrite(
        'create_session_request',
        {
          agentId: 'test_agent',
          purpose: 'testing',
          requiredCategories: ['FOOD'],
          requiredScopes: ['preferences.food.read'],
          requestedUses: 10,
          ttlSeconds: 3600,
        },
        'participant_001'
      );

      expect(result.contract).toBe('ParticipantIntelligenceEngine');
      expect(result.method).toBe('CreateSessionRequest');
    });
  });

  describe('submitSignedWrite', () => {
    it('should submit valid signed write', async () => {
      // First prepare
      const prepared = await adapter.prepareContractWrite(
        'update_category_ref',
        {
          category: 'FOOD',
          ref: 'bafy_updated_cid',
          schemaVersion: '1.0',
          updatedAt: getCurrentTimestamp(),
        },
        'participant_001'
      );

      // Then submit
      const result = await adapter.submitSignedWrite(
        prepared.payload,
        '0x1234567890abcdef'
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toMatch(/^0x/);
    });

    it('should reject invalid signature', async () => {
      const prepared = await adapter.prepareContractWrite(
        'update_category_ref',
        {
          category: 'FOOD',
          ref: 'bafy_cid',
          schemaVersion: '1.0',
          updatedAt: getCurrentTimestamp(),
        },
        'participant_001'
      );

      const result = await adapter.submitSignedWrite(prepared.payload, '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should apply state change after submit', async () => {
      const prepared = await adapter.prepareContractWrite(
        'update_category_ref',
        {
          category: 'PAYMENT',
          ref: 'bafy_payment_new',
          schemaVersion: '2.0',
          updatedAt: getCurrentTimestamp(),
        },
        'participant_001'
      );

      await adapter.submitSignedWrite(prepared.payload, '0x1234567890abcdef');

      // Verify state was updated
      const refs = await adapter.getCategoryRefs('participant_001', ['PAYMENT']);
      expect(refs.PAYMENT?.ref).toBe('bafy_payment_new');
      expect(refs.PAYMENT?.schemaVersion).toBe('2.0');
    });
  });

  describe('getTransactionStatus', () => {
    it('should return pending for unknown transaction', async () => {
      const status = await adapter.getTransactionStatus('0xunknown');
      expect(status).toBe('pending');
    });

    it('should track submitted transaction status', async () => {
      const prepared = await adapter.prepareContractWrite(
        'update_category_ref',
        {
          category: 'FOOD',
          ref: 'bafy_cid',
          schemaVersion: '1.0',
          updatedAt: getCurrentTimestamp(),
        },
        'participant_001'
      );

      const submitResult = await adapter.submitSignedWrite(
        prepared.payload,
        '0x1234567890abcdef'
      );

      if (submitResult.txHash) {
        // Initially pending
        const status = await adapter.getTransactionStatus(submitResult.txHash);
        expect(status).toBe('pending');
      }
    });
  });
});
