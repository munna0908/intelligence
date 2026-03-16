/**
 * Health Routes
 */

import { Router } from 'express';
import { getHealth } from '../controller/health.controller.js';

const router = Router();

// GET /v1/health
router.get('/health', getHealth);

export { router as healthRouter };
