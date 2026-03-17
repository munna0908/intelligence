/**
 * Writes Controller
 *
 * Request handlers for write operations.
 */

import type { Request, Response, NextFunction } from 'express';
import { getWritesService } from '../../../services/writes.service.js';
import { getLogger } from '../../../logging/index.js';

/**
 * POST /v1/writes/prepare
 */
export async function prepareWrite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });

  try {
    const body = req.body;
    logger.info(
      {
        requestId: body.requestId,
        participantId: body.participantId,
        action: body.action,
      },
      'POST writes/prepare'
    );

    const service = getWritesService();
    const result = await service.prepareWrite(body);

    logger.info(
      {
        requestId: body.requestId,
        participantId: body.participantId,
        action: body.action,
        method: result.method,
        expiresAt: result.expiresAt,
      },
      'Write prepared'
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /v1/writes/submit
 */
export async function submitWrite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });

  try {
    const body = req.body;
    logger.info(
      {
        requestId: body.requestId,
        participantId: body.participantId,
        action: body.action,
      },
      'POST writes/submit'
    );

    const service = getWritesService();
    const result = await service.submitWrite(body);

    logger.info(
      {
        requestId: body.requestId,
        participantId: body.participantId,
        action: body.action,
        status: result.status,
        txHash: result.txHash,
      },
      'Write submitted'
    );

    const statusCode = result.status === 'submitted' ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /v1/writes/status/:txHash
 */
export async function getWriteStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });

  try {
    const txHash = req.params['txHash'] as string;
    logger.info({ txHash }, 'GET writes/status');

    const service = getWritesService();
    const result = await service.getTransactionStatus(txHash);

    logger.info({ txHash, status: result.status }, 'Write status retrieved');

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
