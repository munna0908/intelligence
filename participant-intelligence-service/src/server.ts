/**
 * Server Entry Point
 */

import { createApp } from './app.js';
import { getConfig } from './config/index.js';
import { getLogger } from './logging/index.js';

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

  const app = await createApp();

  try {
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

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
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    try {
      await app.close();
      logger.info('Server closed gracefully');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
