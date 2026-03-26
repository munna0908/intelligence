/**
 * Version 1 Router
 *
 * Aggregates all v1 route modules.
 */

import { Router } from 'express';
import { intelligenceRouter } from './routes/intelligence.router.js';
import { sessionsRouter } from './routes/sessions.router.js';
import { writesRouter } from './routes/writes.router.js';
import { healthRouter } from './routes/health.router.js';
import { participantsRouter } from './routes/participants.router.js';

const router = Router();

// Mount all route modules
router.use(intelligenceRouter);
router.use(sessionsRouter);
router.use(writesRouter);
router.use(healthRouter);
router.use(participantsRouter);

export { router as versionRouter };
