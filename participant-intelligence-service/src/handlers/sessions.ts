/**
 * Sessions Route Handlers
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getSessionsService } from '../services/sessions/index.js';
import {
  getSessionParamsSchema,
  ensureSessionBodySchema,
  validateSessionBodySchema,
} from '../validation/schemas.js';
import { createRequestLogger } from '../logging/index.js';
import { generateRequestId } from '../utils/index.js';

/**
 * GET /v1/sessions/:participantId/:sessionId
 */
export async function getSessionHandler(
  request: FastifyRequest<{ Params: { participantId: string; sessionId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const logger = createRequestLogger(requestId);

  try {
    // Validate params
    const params = getSessionParamsSchema.parse(request.params);
    logger.info(
      { participantId: params.participantId, sessionId: params.sessionId },
      'GET session'
    );

    const service = getSessionsService();
    const result = await service.getSession(params.participantId, params.sessionId);

    if (!result) {
      reply.status(404).send({
        error: 'not_found',
        message: `Session ${params.sessionId} not found for participant ${params.participantId}`,
      });
      return;
    }

    reply.status(200).send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get session');

    if (error instanceof Error && error.name === 'ZodError') {
      reply.status(400).send({
        error: 'validation_error',
        message: 'Invalid request parameters',
        details: error,
      });
      return;
    }

    reply.status(500).send({
      error: 'internal_error',
      message: 'Failed to fetch session',
    });
  }
}

/**
 * POST /v1/sessions/ensure
 */
export async function ensureSessionHandler(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const logger = createRequestLogger(requestId);

  try {
    // Validate body
    const body = ensureSessionBodySchema.parse(request.body);
    logger.info(
      {
        participantId: body.participantId,
        agentId: body.agentId,
        purpose: body.purpose,
        requiredCategories: body.requiredCategories,
      },
      'POST sessions/ensure'
    );

    const service = getSessionsService();
    const result = await service.ensureSession(body);

    logger.info(
      {
        participantId: body.participantId,
        agentId: body.agentId,
        status: result.status,
        sessionId: 'sessionId' in result ? result.sessionId : undefined,
      },
      'Session ensure result'
    );

    reply.status(200).send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to ensure session');

    if (error instanceof Error && error.name === 'ZodError') {
      reply.status(400).send({
        error: 'validation_error',
        message: 'Invalid request body',
        details: error,
      });
      return;
    }

    reply.status(500).send({
      error: 'internal_error',
      message: 'Failed to ensure session',
    });
  }
}

/**
 * POST /v1/sessions/validate
 */
export async function validateSessionHandler(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const logger = createRequestLogger(requestId);

  try {
    // Validate body
    const body = validateSessionBodySchema.parse(request.body);
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

    reply.status(200).send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to validate session');

    if (error instanceof Error && error.name === 'ZodError') {
      reply.status(400).send({
        error: 'validation_error',
        message: 'Invalid request body',
        details: error,
      });
      return;
    }

    reply.status(500).send({
      error: 'internal_error',
      message: 'Failed to validate session',
    });
  }
}
