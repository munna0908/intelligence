/**
 * Intelligence Controller
 *
 * Request handlers for intelligence object operations.
 */

import type { Request, Response, NextFunction } from 'express';
import { getIntelligenceService } from '../../../services/intelligence.service.js';
import { getLogger } from '../../../logging/index.js';

/**
 * GET /v1/intelligence/:participantId
 */
export async function getIntelligence(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });

  try {
    const participantId = req.params['participantId'] as string;
    logger.info({ participantId }, 'GET intelligence');

    const service = getIntelligenceService();
    const result = await service.getIntelligenceObject(participantId);

    if (!result) {
      res.status(404).json({
        error: 'not_found',
        message: `Participant ${participantId} not found`,
      });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /v1/categories/get
 */
export async function getCategories(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });

  try {
    const { participantId, categories } = req.body;
    logger.info({ participantId, categories }, 'POST categories/get');

    const service = getIntelligenceService();
    const result = await service.getCategoryRefs(participantId, categories);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
