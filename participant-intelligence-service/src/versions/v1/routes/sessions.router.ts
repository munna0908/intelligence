/**
 * Sessions Routes
 */

import { Router } from 'express';
import { getSession, validateSession } from '../controller/sessions.controller.js';
import { validateBody, validateParams } from '../../../middlewares/validation.middleware.js';
import {
  getSessionParamsSchema,
  validateSessionBodySchema,
} from '../../../validation/schemas.js';

const router = Router();

// GET /v1/sessions/:participantId/:sessionId
router.get(
  '/sessions/:participantId/:sessionId',
  validateParams(getSessionParamsSchema),
  getSession
);

// POST /v1/sessions/validate
router.post(
  '/sessions/validate',
  validateBody(validateSessionBodySchema),
  validateSession
);

export { router as sessionsRouter };
