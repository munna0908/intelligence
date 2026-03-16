/**
 * Mock MOI Interface Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  mockStore,
  mockGetIntelligenceObject,
  mockGetCategoryRefs,
  mockGetSession,
  mockFindValidSession,
  mockValidateSession,
  mockPrepareContractWrite,
  mockSubmitSignedWrite,
  mockGetTransactionStatus,
} from '../../src/moi/interface/mock.interface.js';
import { getCurrentTimestamp } from '../../src/utils/index.js';

describe('Mock MOI Interface', () => {
  beforeEach(() => {
    mockStore.reset();
  });

  describe('mockGetIntelligenceObject', () => {
    it('should return intelligence object for existing participant', async () => {
      const result = await mockGetIntelligenceObject('participant_001');

      expect(result).not.toBeNull();
      expect(result?.participantId).toBe('participant_001');
      expect(result?.version).toBe('1.0');
      expect(result?.categoryRefs.FOOD).toBeDefined();
      expect(result?.categoryRefs.HEALTH).toBeDefined();
    });

    it('should return null for non-existent participant', async () => {
      const result = await mockGetIntelligenceObject('non_existent');
      expect(result).toBeNull();
    });
  });

  describe('mockGetCategoryRefs', () => {
    it('should return requested category refs', async () => {
      const result = await mockGetCategoryRefs('participant_001', ['FOOD', 'HEALTH']);

      expect(result.FOOD).toBeDefined();
      expect(result.FOOD?.ref).toBe('bafy_food_cid_001');
      expect(result.HEALTH).toBeDefined();
    });

    it('should return empty for non-existent categories', async () => {
      const result = await mockGetCategoryRefs('participant_001', ['ADDRESS', 'PAYMENT']);
      expect(result.ADDRESS).toBeUndefined();
      expect(result.PAYMENT).toBeUndefined();
    });

    it('should return empty for non-existent participant', async () => {
      const result = await mockGetCategoryRefs('non_existent', ['FOOD']);
      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe('mockGetSession', () => {
    it('should return session for existing session', async () => {
      const result = await mockGetSession('participant_001', 'sess_existing_001');

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('sess_existing_001');
      expect(result?.status).toBe('ACTIVE');
      expect(result?.agentId).toBe('openclaw_whatsapp_bot');
    });

    it('should return null for non-existent session', async () => {
      const result = await mockGetSession('participant_001', 'non_existent');
      expect(result).toBeNull();
    });
  });

  describe('mockFindValidSession', () => {
    it('should find valid session matching requirements', async () => {
      const currentTime = getCurrentTimestamp();
      const result = await mockFindValidSession(
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
      const result = await mockFindValidSession(
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
      const result = await mockFindValidSession(
        'participant_001',
        'openclaw_whatsapp_bot',
        ['FOOD', 'PAYMENT'], // PAYMENT not in existing session
        ['preferences.food.read'],
        currentTime
      );

      expect(result).toBeNull();
    });
  });

  describe('mockValidateSession', () => {
    it('should validate existing active session', async () => {
      const currentTime = getCurrentTimestamp();
      const result = await mockValidateSession(
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
      const result = await mockValidateSession(
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
      const result = await mockValidateSession(
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
      const result = await mockValidateSession(
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
      const result = await mockValidateSession(
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

  describe('mockPrepareContractWrite', () => {
    it('should prepare update_category_ref write', async () => {
      const result = await mockPrepareContractWrite(
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
      const result = await mockPrepareContractWrite(
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

  describe('mockSubmitSignedWrite', () => {
    it('should submit valid signed write', async () => {
      // First prepare
      const prepared = await mockPrepareContractWrite(
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
      const result = await mockSubmitSignedWrite(
        prepared.payload,
        '0x1234567890abcdef'
      );

      expect(result.success).toBe(true);
      expect(result.txHash).toMatch(/^0x/);
    });

    it('should reject invalid signature', async () => {
      const prepared = await mockPrepareContractWrite(
        'update_category_ref',
        {
          category: 'FOOD',
          ref: 'bafy_cid',
          schemaVersion: '1.0',
          updatedAt: getCurrentTimestamp(),
        },
        'participant_001'
      );

      const result = await mockSubmitSignedWrite(prepared.payload, '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should apply state change after submit', async () => {
      const prepared = await mockPrepareContractWrite(
        'update_category_ref',
        {
          category: 'PAYMENT',
          ref: 'bafy_payment_new',
          schemaVersion: '2.0',
          updatedAt: getCurrentTimestamp(),
        },
        'participant_001'
      );

      await mockSubmitSignedWrite(prepared.payload, '0x1234567890abcdef');

      // Verify state was updated
      const refs = await mockGetCategoryRefs('participant_001', ['PAYMENT']);
      expect(refs.PAYMENT?.ref).toBe('bafy_payment_new');
      expect(refs.PAYMENT?.schemaVersion).toBe('2.0');
    });
  });

  describe('mockGetTransactionStatus', () => {
    it('should return pending for unknown transaction', async () => {
      const status = await mockGetTransactionStatus('0xunknown');
      expect(status).toBe('pending');
    });

    it('should track submitted transaction status', async () => {
      const prepared = await mockPrepareContractWrite(
        'update_category_ref',
        {
          category: 'FOOD',
          ref: 'bafy_cid',
          schemaVersion: '1.0',
          updatedAt: getCurrentTimestamp(),
        },
        'participant_001'
      );

      const submitResult = await mockSubmitSignedWrite(
        prepared.payload,
        '0x1234567890abcdef'
      );

      if (submitResult.txHash) {
        // Initially pending
        const status = await mockGetTransactionStatus(submitResult.txHash);
        expect(status).toBe('pending');
      }
    });
  });
});
