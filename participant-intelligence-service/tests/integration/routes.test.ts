/**
 * Route Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../../src/server.js';
import { mockStore } from '../../src/moi/interface/mock.interface.js';
import { getCurrentTimestamp } from '../../src/utils/index.js';
import type { Express } from 'express';
import request from 'supertest';

describe('API Routes', () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
  });

  afterAll(async () => {
    // No explicit close needed for Express without active server
  });

  beforeEach(() => {
    mockStore.reset();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('participant-intelligence-service');
    });
  });

  describe('GET /v1/intelligence/:participantId', () => {
    it('should return intelligence object', async () => {
      const response = await request(app).get('/v1/intelligence/participant_001');

      expect(response.status).toBe(200);
      expect(response.body.participantId).toBe('participant_001');
      expect(response.body.categoryRefs.FOOD).toBeDefined();
    });

    it('should return 404 for non-existent participant', async () => {
      const response = await request(app).get('/v1/intelligence/non_existent');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /v1/categories/get', () => {
    it('should return requested categories', async () => {
      const response = await request(app)
        .post('/v1/categories/get')
        .send({
          participantId: 'participant_001',
          categories: ['FOOD', 'HEALTH'],
        });

      expect(response.status).toBe(200);
      expect(response.body.participantId).toBe('participant_001');
      expect(response.body.categoryRefs.FOOD).toBeDefined();
    });

    it('should return 400 for invalid category', async () => {
      const response = await request(app)
        .post('/v1/categories/get')
        .send({
          participantId: 'participant_001',
          categories: ['INVALID'],
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /v1/sessions/:participantId/:sessionId', () => {
    it('should return session', async () => {
      const response = await request(app).get('/v1/sessions/participant_001/sess_existing_001');

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe('sess_existing_001');
      expect(response.body.status).toBe('ACTIVE');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app).get('/v1/sessions/participant_001/non_existent');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /v1/sessions/validate', () => {
    it('should validate existing session', async () => {
      const response = await request(app)
        .post('/v1/sessions/validate')
        .send({
          participantId: 'participant_001',
          agentId: 'openclaw_whatsapp_bot',
          sessionId: 'sess_existing_001',
          requiredCategories: ['FOOD'],
          requiredScopes: ['preferences.food.read'],
          currentTime: getCurrentTimestamp(),
        });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
    });

    it('should return invalid for wrong agent', async () => {
      const response = await request(app)
        .post('/v1/sessions/validate')
        .send({
          participantId: 'participant_001',
          agentId: 'wrong_agent',
          sessionId: 'sess_existing_001',
          requiredCategories: ['FOOD'],
          requiredScopes: ['preferences.food.read'],
          currentTime: getCurrentTimestamp(),
        });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.reason).toBe('agent_mismatch');
    });
  });

  describe('POST /v1/writes/prepare', () => {
    it('should prepare write request', async () => {
      const response = await request(app)
        .post('/v1/writes/prepare')
        .send({
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

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready_to_sign');
      expect(response.body.method).toBe('SetCategoryRef');
      expect(response.body.ixObject).toBeDefined();
      expect(response.body.ixObject.sender).toBeDefined();
      expect(response.body.ixObject.fuel_limit).toBeDefined();
      expect(response.body.expiresAt).toBeGreaterThan(Date.now() / 1000);
    });
  });

  describe('POST /v1/writes/submit', () => {
    it('should submit signed write', async () => {
      // First prepare
      const prepareResponse = await request(app)
        .post('/v1/writes/prepare')
        .send({
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

      const prepared = prepareResponse.body;

      // Create a mock signed interaction request (as the wallet would)
      const signedIx = {
        ix_args: '0x1234567890abcdef',
        signatures: '0xmocksignature123',
      };

      // Then submit with the signed interaction
      const response = await request(app)
        .post('/v1/writes/submit')
        .send({
          requestId: prepared.requestId,
          participantId: 'participant_001',
          action: 'update_category_ref',
          signedIx,
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('submitted');
      expect(response.body.txHash).toMatch(/^0x/);
    });
  });

  describe('GET /v1/writes/status/:txHash', () => {
    it('should return transaction status', async () => {
      const response = await request(app).get('/v1/writes/status/0xabc123def456789');

      expect(response.status).toBe(200);
      expect(response.body.txHash).toBe('0xabc123def456789');
    });

    it('should return 400 for invalid txHash format', async () => {
      const response = await request(app).get('/v1/writes/status/invalid');

      expect(response.status).toBe(400);
    });
  });
});
