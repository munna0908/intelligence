/**
 * Structured logging using pino
 */

import pino from 'pino';
import { getConfig } from '../config/index.js';

export interface LogContext {
  requestId?: string;
  participantId?: string;
  sessionId?: string;
  agentId?: string;
  action?: string;
  categories?: string[];
  status?: string;
  txHash?: string;
  reason?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
}

let loggerInstance: pino.Logger | null = null;

export function createLogger(): pino.Logger {
  const config = getConfig();

  return pino({
    level: config.logging.level,
    transport:
      config.server.nodeEnv === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'participant-intelligence-service',
      env: config.server.nodeEnv,
    },
    // Redact sensitive fields
    redact: {
      paths: ['signature', 'payload.signature', 'req.headers.authorization'],
      censor: '[REDACTED]',
    },
  });
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

export function createChildLogger(context: LogContext): pino.Logger {
  return getLogger().child(context);
}

// Helper to create a request-scoped logger
export function createRequestLogger(requestId: string): pino.Logger {
  return createChildLogger({ requestId });
}
