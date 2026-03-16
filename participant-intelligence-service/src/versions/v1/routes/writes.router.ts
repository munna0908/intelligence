/**
 * Writes Routes
 */

import { Router } from 'express';
import { prepareWrite, submitWrite, getWriteStatus } from '../controller/writes.controller.js';
import { validateBody, validateParams } from '../../../middlewares/validation.middleware.js';
import {
  prepareWriteBodyBaseSchema,
  submitWriteBodySchema,
  getWriteStatusParamsSchema,
} from '../../../validation/schemas.js';

const router = Router();

// POST /v1/writes/prepare
router.post(
  '/writes/prepare',
  validateBody(prepareWriteBodyBaseSchema),
  prepareWrite
);

// POST /v1/writes/submit
router.post(
  '/writes/submit',
  validateBody(submitWriteBodySchema),
  submitWrite
);

// GET /v1/writes/status/:txHash
router.get(
  '/writes/status/:txHash',
  validateParams(getWriteStatusParamsSchema),
  getWriteStatus
);

export { router as writesRouter };
