/**
 * Validation middleware using Zod schemas
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Validate request body against a Zod schema
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid request body',
          details: error.errors,
        });
        return;
      }
      next(error);
    }
  };
}

/**
 * Validate request params against a Zod schema
 */
export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid request parameters',
          details: error.errors,
        });
        return;
      }
      next(error);
    }
  };
}

/**
 * Validate request query against a Zod schema
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid query parameters',
          details: error.errors,
        });
        return;
      }
      next(error);
    }
  };
}

/**
 * Type guard to check if error is a ZodError
 */
function isZodError(error: unknown): error is ZodError {
  return error instanceof Error && error.name === 'ZodError';
}
