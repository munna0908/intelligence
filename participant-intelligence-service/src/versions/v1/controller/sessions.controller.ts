/**
 * Sessions Controller
 *
 * Request handlers for session operations.
 */

import type { Request, Response, NextFunction } from 'express';
import { getSessionsService } from '../../../services/sessions.service.js';
import { getLogger } from '../../../logging/index.js';

/**
 * GET /v1/sessions/:participantId/:sessionId
 */
export async function getSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });

  try {
    const participantId = req.params['participantId'] as string;
    const sessionId = req.params['sessionId'] as string;
    logger.info({ participantId, sessionId }, 'GET session');

    const service = getSessionsService();
    const result = await service.getSession(participantId, sessionId);

    if (!result) {
      res.status(404).json({
        error: 'not_found',
        message: `Session ${sessionId} not found for participant ${participantId}`,
      });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /v1/sessions/validate
 */
export async function validateSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = getLogger().child({ requestId: req.requestId });

  try {
    const body = req.body;
    logger.info(
      {
        participantId: body.participantId,
        agentId: body.agentId,
        sessionId: body.sessionId,
        requiredCategories: body.requiredCategories,
      },
      'POST sessions/validate'
    );

    const service = getSessionsService();
    const result = await service.validateSession(body);

    logger.info(
      {
        participantId: body.participantId,
        sessionId: body.sessionId,
        valid: result.valid,
        reason: result.reason,
      },
      'Session validation result'
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
