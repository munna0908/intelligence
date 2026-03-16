/**
 * Intelligence Routes
 */

import { Router } from 'express';
import { getIntelligence, getCategories } from '../controller/intelligence.controller.js';
import { validateBody, validateParams } from '../../../middlewares/validation.middleware.js';
import {
  getIntelligenceParamsSchema,
  getCategoriesBodySchema,
} from '../../../validation/schemas.js';

const router = Router();

// GET /v1/intelligence/:participantId
router.get(
  '/intelligence/:participantId',
  validateParams(getIntelligenceParamsSchema),
  getIntelligence
);

// POST /v1/categories/get
router.post(
  '/categories/get',
  validateBody(getCategoriesBodySchema),
  getCategories
);

export { router as intelligenceRouter };
