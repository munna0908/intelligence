/**
 * Intelligence Route Handlers
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getIntelligenceService } from '../services/intelligence/index.js';
import {
  getIntelligenceParamsSchema,
  getCategoriesBodySchema,
} from '../validation/schemas.js';
import { createRequestLogger } from '../logging/index.js';
import { generateRequestId } from '../utils/index.js';

/**
 * GET /v1/intelligence/:participantId
 */
export async function getIntelligenceHandler(
  request: FastifyRequest<{ Params: { participantId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const logger = createRequestLogger(requestId);

  try {
    // Validate params
    const params = getIntelligenceParamsSchema.parse(request.params);
    logger.info({ participantId: params.participantId }, 'GET intelligence');

    const service = getIntelligenceService();
    const result = await service.getIntelligenceObject(params.participantId);

    if (!result) {
      reply.status(404).send({
        error: 'not_found',
        message: `Participant ${params.participantId} not found`,
      });
      return;
    }

    reply.status(200).send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get intelligence object');

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
      message: 'Failed to fetch intelligence object',
    });
  }
}

/**
 * POST /v1/categories/get
 */
export async function getCategoriesHandler(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const logger = createRequestLogger(requestId);

  try {
    // Validate body
    const body = getCategoriesBodySchema.parse(request.body);
    logger.info(
      { participantId: body.participantId, categories: body.categories },
      'POST categories/get'
    );

    const service = getIntelligenceService();
    const result = await service.getCategoryRefs(body.participantId, body.categories);

    reply.status(200).send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get categories');

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
      message: 'Failed to fetch category refs',
    });
  }
}
