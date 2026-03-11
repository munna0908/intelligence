/**
 * Route Registration
 */

import type { FastifyInstance } from 'fastify';
import {
  getIntelligenceHandler,
  getCategoriesHandler,
} from '../handlers/intelligence.js';
import {
  getSessionHandler,
  ensureSessionHandler,
  validateSessionHandler,
} from '../handlers/sessions.js';
import {
  prepareWriteHandler,
  submitWriteHandler,
  getWriteStatusHandler,
} from '../handlers/writes.js';

/**
 * Register all API routes
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'participant-intelligence-service' }));

  // Intelligence routes
  app.get('/v1/intelligence/:participantId', getIntelligenceHandler);
  app.post('/v1/categories/get', getCategoriesHandler);

  // Session routes
  app.get('/v1/sessions/:participantId/:sessionId', getSessionHandler);
  app.post('/v1/sessions/ensure', ensureSessionHandler);
  app.post('/v1/sessions/validate', validateSessionHandler);

  // Write routes
  app.post('/v1/writes/prepare', prepareWriteHandler);
  app.post('/v1/writes/submit', submitWriteHandler);
  app.get('/v1/writes/status/:txHash', getWriteStatusHandler);
}
