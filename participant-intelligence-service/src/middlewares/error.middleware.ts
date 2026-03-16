/**
 * Error handling middleware for Express
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { getLogger } from '../logging/index.js';
import { getConfig } from '../config/index.js';

/**
 * Global error handler middleware
 */
export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const logger = getLogger();
  const config = getConfig();

  logger.error(
    {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      error: error.message,
      stack: error.stack,
    },
    'Request error'
  );

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request data',
      details: error.errors,
    });
    return;
  }

  // Handle other errors
  const isDevelopment = config.server.nodeEnv === 'local' || config.server.nodeEnv === 'development';

  res.status(500).json({
    error: 'internal_error',
    message: isDevelopment ? error.message : 'Internal server error',
  });
}

/**
 * Not found handler middleware
 */
export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found`,
  });
}
