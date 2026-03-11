/**
 * Writes Route Handlers
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getWritesService } from '../services/writes/index.js';
import {
  prepareWriteBodyBaseSchema,
  submitWriteBodySchema,
  getWriteStatusParamsSchema,
} from '../validation/schemas.js';
import { createRequestLogger } from '../logging/index.js';
import { generateRequestId } from '../utils/index.js';

/**
 * POST /v1/writes/prepare
 */
export async function prepareWriteHandler(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const logger = createRequestLogger(requestId);

  try {
    // Validate base body structure
    const body = prepareWriteBodyBaseSchema.parse(request.body);
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

    reply.status(200).send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to prepare write');

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
      message: 'Failed to prepare write request',
    });
  }
}

/**
 * POST /v1/writes/submit
 */
export async function submitWriteHandler(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const logger = createRequestLogger(requestId);

  try {
    // Validate body
    const body = submitWriteBodySchema.parse(request.body);
    logger.info(
      {
        requestId: body.requestId,
        participantId: body.participantId,
        action: body.action,
        contract: body.payload.contract,
        method: body.payload.method,
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
    reply.status(statusCode).send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to submit write');

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
      message: 'Failed to submit write',
    });
  }
}

/**
 * GET /v1/writes/status/:txHash
 */
export async function getWriteStatusHandler(
  request: FastifyRequest<{ Params: { txHash: string } }>,
  reply: FastifyReply
): Promise<void> {
  const requestId = generateRequestId();
  const logger = createRequestLogger(requestId);

  try {
    // Validate params
    const params = getWriteStatusParamsSchema.parse(request.params);
    logger.info({ txHash: params.txHash }, 'GET writes/status');

    const service = getWritesService();
    const result = await service.getTransactionStatus(params.txHash);

    logger.info({ txHash: params.txHash, status: result.status }, 'Write status retrieved');

    reply.status(200).send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get write status');

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
      message: 'Failed to fetch transaction status',
    });
  }
}
