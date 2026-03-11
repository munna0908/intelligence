/**
 * Fastify Application Setup
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { getConfig } from './config/index.js';
import { getLogger } from './logging/index.js';
import { registerRoutes } from './routes/index.js';

/**
 * Create and configure the Fastify application
 */
export async function createApp(): Promise<FastifyInstance> {
  const config = getConfig();
  const logger = getLogger();

  const app = Fastify({
    logger: false, // We use our own logger
    trustProxy: true,
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Request logging hook
  app.addHook('onRequest', async (request) => {
    logger.info(
      {
        method: request.method,
        path: request.url,
        requestId: request.id,
      },
      'Incoming request'
    );
  });

  // Response logging hook
  app.addHook('onResponse', async (request, reply) => {
    logger.info(
      {
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        duration: reply.elapsedTime,
      },
      'Request completed'
    );
  });

  // Error handler
  app.setErrorHandler(async (error, request, reply) => {
    logger.error(
      {
        method: request.method,
        path: request.url,
        error: error.message,
        stack: error.stack,
      },
      'Request error'
    );

    reply.status(500).send({
      error: 'internal_error',
      message: config.server.nodeEnv === 'development' ? error.message : 'Internal server error',
    });
  });

  // Register routes
  await registerRoutes(app);

  return app;
}
