/**
 * Writes Controller
 *
 * Request handlers for write operations.
 */

import type { Request, Response, NextFunction } from 'express';
import { getWritesService } from '../../../services/writes.service.js';
import { prepareAssetTransfer, submitSignedWrite } from '../../../moi/interface/writes.interface.js';
import { getLogger } from '../../../logging/index.js';

/**
 * POST /v1/payment/prepare
 * Body: { assetId, beneficiary, amount, sender? }
 */
export async function preparePayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });
  try {
    const { assetId, beneficiary, amount, sender } = req.body as {
      assetId?: string;
      beneficiary?: string;
      amount?: number;
      sender?: string;
    };
    if (!assetId || !beneficiary || amount == null) {
      res.status(400).json({ error: 'assetId, beneficiary, and amount are required' });
      return;
    }
    logger.info({ assetId, beneficiary, amount, sender }, 'POST payment/prepare');
    const ixObject = await prepareAssetTransfer(assetId, beneficiary, Number(amount), sender);
    res.status(200).json({ ixObject });
  } catch (error: any) {
    if (error.message === 'insufficient_balance') {
      res.status(422).json({ error: 'insufficient_balance', balance: error.balance, required: error.required });
      return;
    }
    if (error.message === 'asset_not_found') {
      res.status(422).json({ error: 'asset_not_found', assetId: error.assetId });
      return;
    }
    next(error);
  }
}

/**
 * POST /v1/payment/submit
 * Body: { signedIx: { ix_args, signatures } }
 */
export async function submitPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });
  try {
    const { signedIx } = req.body as { signedIx?: { ix_args: string; signatures: string } };
    if (!signedIx?.ix_args || !signedIx?.signatures) {
      res.status(400).json({ error: 'signedIx with ix_args and signatures is required' });
      return;
    }
    logger.info('POST payment/submit');
    const result = await submitSignedWrite(signedIx as any);
    if (!result.success) {
      logger.error({ error: result.error, txHash: result.txHash }, 'Payment submission failed');
      res.status(400).json({ error: result.error ?? 'Transaction submission failed', txHash: result.txHash });
      return;
    }
    logger.info({ txHash: result.txHash }, 'Payment submitted');
    res.status(200).json({ txHash: result.txHash });
  } catch (error) {
    next(error);
  }
}

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
