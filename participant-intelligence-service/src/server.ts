/**
 * Express Server Entry Point
 */

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getConfig } from './config/index.js';
import { getLogger } from './logging/index.js';
import { loggerMiddleware, errorMiddleware, notFoundMiddleware } from './middlewares/index.js';
import { versionRouter } from './versions/v1/version.router.js';

/**
 * Create and configure the Express application
 */
export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration
  app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use(loggerMiddleware);

  // Health check (outside versioned routes)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'participant-intelligence-service' });
  });

  // API routes
  app.use('/v1', versionRouter);

  // 404 handler
  app.use(notFoundMiddleware);

  // Error handler
  app.use(errorMiddleware);

  return app;
}

/**
 * Start the server
 */
async function main(): Promise<void> {
  const config = getConfig();
  const logger = getLogger();

  logger.info(
    {
      nodeEnv: config.server.nodeEnv,
      useMockAdapter: config.moi.useMockAdapter,
    },
    'Starting Participant Intelligence Service'
  );

  const app = createApp();

  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(
      {
        port: config.server.port,
        host: config.server.host,
      },
      'Server started successfully'
    );

    // Log available endpoints
    logger.info('Available endpoints:');
    logger.info('  GET  /health');
    logger.info('  GET  /v1/intelligence/:participantId');
    logger.info('  POST /v1/categories/get');
    logger.info('  GET  /v1/sessions/:participantId/:sessionId');
    logger.info('  POST /v1/sessions/ensure');
    logger.info('  POST /v1/sessions/validate');
    logger.info('  POST /v1/writes/prepare');
    logger.info('  POST /v1/writes/submit');
    logger.info('  GET  /v1/writes/status/:txHash');
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    server.close((err) => {
      if (err) {
        logger.error({ error: err }, 'Error during shutdown');
        process.exit(1);
      }
      logger.info('Server closed gracefully');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
