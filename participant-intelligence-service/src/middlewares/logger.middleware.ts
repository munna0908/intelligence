/**
 * Request logging middleware for Express
 */

import type { Request, Response, NextFunction } from 'express';
import { getLogger } from '../logging/index.js';
import { generateRequestId } from '../utils/crypto.utils.js';

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

/**
 * Middleware to log incoming requests and responses
 */
export function loggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const logger = getLogger();

  // Generate and attach request ID
  req.requestId = generateRequestId();
  req.startTime = Date.now();

  // Log incoming request
  logger.info(
    {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      query: req.query,
    },
    'Incoming request'
  );

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;

    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      },
      'Request completed'
    );
  });

  next();
}
