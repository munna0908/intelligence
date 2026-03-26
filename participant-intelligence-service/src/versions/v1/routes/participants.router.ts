/**
 * Participants Routes
 *
 * Exposes the in-memory participant mapping store over HTTP so that
 * external services (e.g. telegram-bot via claw-orchestrator) can
 * persist registrations without needing a database or file system.
 */

import { Router, Request, Response } from 'express';
import {
  lookupParticipant,
  createParticipant,
  deleteParticipant,
} from '../../../services/participant.service.js';

const router = Router();

// GET /v1/participants/lookup?channel=telegram&externalUserId=12345
router.get('/participants/lookup', (req: Request, res: Response) => {
  const { channel, externalUserId } = req.query as { channel?: string; externalUserId?: string };
  if (!channel || !externalUserId) {
    res.status(400).json({ error: 'channel and externalUserId are required' });
    return;
  }
  const result = lookupParticipant(channel, externalUserId);
  res.json(result);
});

// POST /v1/participants
router.post('/participants', (req: Request, res: Response) => {
  const { channel, externalUserId, moiAccountId } = req.body ?? {};
  if (!channel || !externalUserId || !moiAccountId) {
    res.status(400).json({ error: 'channel, externalUserId, and moiAccountId are required' });
    return;
  }
  try {
    const mapping = createParticipant(channel, externalUserId, moiAccountId);
    res.status(201).json({ mapping });
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

// DELETE /v1/participants/:channel/:externalUserId
router.delete('/participants/:channel/:externalUserId', (req: Request, res: Response) => {
  const channel = req.params['channel']!;
  const externalUserId = req.params['externalUserId']!;
  const deleted = deleteParticipant(channel, externalUserId);
  res.json({ deleted });
});

export { router as participantsRouter };
