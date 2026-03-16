/**
 * Health Controller
 *
 * Request handlers for health check operations.
 */

import type { Request, Response } from 'express';

/**
 * GET /v1/health
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    service: 'participant-intelligence-service',
    version: 'v1',
  });
}
