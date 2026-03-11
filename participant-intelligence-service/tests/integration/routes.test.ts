/**
 * Route Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../../src/app.js';
import { mockStore } from '../../src/adapters/moi-sdk/mock.js';
import { getCurrentTimestamp } from '../../src/utils/index.js';
import type { FastifyInstance } from 'fastify';

describe('API Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockStore.reset();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('participant-intelligence-service');
    });
  });

  describe('GET /v1/intelligence/:participantId', () => {
    it('should return intelligence object', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/intelligence/participant_001',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.participantId).toBe('participant_001');
      expect(body.categoryRefs.FOOD).toBeDefined();
    });

    it('should return 404 for non-existent participant', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/intelligence/non_existent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /v1/categories/get', () => {
    it('should return requested categories', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/categories/get',
        payload: {
          participantId: 'participant_001',
          categories: ['FOOD', 'HEALTH'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.participantId).toBe('participant_001');
      expect(body.categoryRefs.FOOD).toBeDefined();
    });

    it('should return 400 for invalid category', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/categories/get',
        payload: {
          participantId: 'participant_001',
          categories: ['INVALID'],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/sessions/:participantId/:sessionId', () => {
    it('should return session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sessions/participant_001/sess_existing_001',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessionId).toBe('sess_existing_001');
      expect(body.status).toBe('ACTIVE');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sessions/participant_001/non_existent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /v1/sessions/ensure', () => {
    it('should return approved for existing session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sessions/ensure',
        payload: {
          participantId: 'participant_001',
          agentId: 'openclaw_whatsapp_bot',
          purpose: 'food_ordering',
          requiredCategories: ['FOOD'],
          requiredScopes: ['preferences.food.read'],
          requestedUses: 3,
          ttlSeconds: 1800,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('approved');
      expect(body.sessionId).toBe('sess_existing_001');
    });

    it('should return pending_signature for new session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sessions/ensure',
        payload: {
          participantId: 'participant_002',
          agentId: 'new_agent',
          purpose: 'new_purpose',
          requiredCategories: ['ADDRESS'],
          requiredScopes: ['profile.address.read'],
          requestedUses: 5,
          ttlSeconds: 1800,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('pending_signature');
      expect(body.writeRequest).toBeDefined();
    });
  });

  describe('POST /v1/sessions/validate', () => {
    it('should validate existing session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sessions/validate',
        payload: {
          participantId: 'participant_001',
          agentId: 'openclaw_whatsapp_bot',
          sessionId: 'sess_existing_001',
          requiredCategories: ['FOOD'],
          requiredScopes: ['preferences.food.read'],
          currentTime: getCurrentTimestamp(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
    });

    it('should return invalid for wrong agent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sessions/validate',
        payload: {
          participantId: 'participant_001',
          agentId: 'wrong_agent',
          sessionId: 'sess_existing_001',
          requiredCategories: ['FOOD'],
          requiredScopes: ['preferences.food.read'],
          currentTime: getCurrentTimestamp(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.reason).toBe('agent_mismatch');
    });
  });

  describe('POST /v1/writes/prepare', () => {
    it('should prepare write request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/writes/prepare',
        payload: {
          requestId: 'req_test',
          participantId: 'participant_001',
          action: 'update_category_ref',
          params: {
            category: 'FOOD',
            ref: 'bafy_new_cid',
            schemaVersion: '1.0',
            updatedAt: getCurrentTimestamp(),
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ready_to_sign');
      expect(body.signingDigest).toMatch(/^0x/);
    });
  });

  describe('POST /v1/writes/submit', () => {
    it('should submit signed write', async () => {
      // First prepare
      const prepareResponse = await app.inject({
        method: 'POST',
        url: '/v1/writes/prepare',
        payload: {
          requestId: 'req_test',
          participantId: 'participant_001',
          action: 'update_category_ref',
          params: {
            category: 'FOOD',
            ref: 'bafy_new_cid',
            schemaVersion: '1.0',
            updatedAt: getCurrentTimestamp(),
          },
        },
      });

      const prepared = JSON.parse(prepareResponse.body);

      // Then submit
      const response = await app.inject({
        method: 'POST',
        url: '/v1/writes/submit',
        payload: {
          requestId: prepared.requestId,
          participantId: 'participant_001',
          action: 'update_category_ref',
          payload: prepared.payload,
          signature: '0x1234567890abcdef',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('submitted');
      expect(body.txHash).toMatch(/^0x/);
    });
  });

  describe('GET /v1/writes/status/:txHash', () => {
    it('should return transaction status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/writes/status/0xabc123def456789',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.txHash).toBe('0xabc123def456789');
    });

    it('should return 400 for invalid txHash format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/writes/status/invalid',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
