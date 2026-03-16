/**
 * HTTP Response utilities following voyage-api patterns
 */

import type { Response } from 'express';

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  data: T;
}

/**
 * HttpResponseResult class for standardized API responses
 */
export class HttpResponseResult<T> {
  private constructor(
    public readonly success: boolean,
    public readonly statusCode: number,
    public readonly data?: T,
    public readonly error?: ApiError
  ) {}

  static ok<T>(data: T, statusCode = 200): HttpResponseResult<T> {
    return new HttpResponseResult(true, statusCode, data);
  }

  static created<T>(data: T): HttpResponseResult<T> {
    return new HttpResponseResult(true, 201, data);
  }

  static noContent(): HttpResponseResult<void> {
    return new HttpResponseResult(true, 204);
  }

  static badRequest(message: string, details?: unknown): HttpResponseResult<void> {
    return new HttpResponseResult(false, 400, undefined, {
      error: 'bad_request',
      message,
      details,
    });
  }

  static unauthorized(message = 'Unauthorized'): HttpResponseResult<void> {
    return new HttpResponseResult(false, 401, undefined, {
      error: 'unauthorized',
      message,
    });
  }

  static forbidden(message = 'Forbidden'): HttpResponseResult<void> {
    return new HttpResponseResult(false, 403, undefined, {
      error: 'forbidden',
      message,
    });
  }

  static notFound(message = 'Resource not found'): HttpResponseResult<void> {
    return new HttpResponseResult(false, 404, undefined, {
      error: 'not_found',
      message,
    });
  }

  static validationError(message: string, details?: unknown): HttpResponseResult<void> {
    return new HttpResponseResult(false, 400, undefined, {
      error: 'validation_error',
      message,
      details,
    });
  }

  static internalError(message = 'Internal server error'): HttpResponseResult<void> {
    return new HttpResponseResult(false, 500, undefined, {
      error: 'internal_error',
      message,
    });
  }

  /**
   * Send the response to the Express response object
   */
  send(res: Response): void {
    if (this.statusCode === 204) {
      res.status(204).end();
      return;
    }

    if (this.success) {
      res.status(this.statusCode).json(this.data);
    } else {
      res.status(this.statusCode).json(this.error);
    }
  }
}

/**
 * Helper function to send success response
 */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json(data);
}

/**
 * Helper function to send error response
 */
export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  message: string,
  details?: unknown
): void {
  res.status(statusCode).json({ error, message, details });
}
