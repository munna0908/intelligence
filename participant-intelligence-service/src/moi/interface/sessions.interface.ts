/**
 * Sessions MOI Interface
 *
 * Handles MOI network interactions for session operations.
d */

import { getLogicDriver } from '../config/provider.config.js';
import type { Session } from '../../domain/models.js';
import type { Category, SessionStatus, ValidationFailureReason } from '../../domain/types.js';
import { isSubset } from '../../utils/crypto.utils.js';
import { getLogger } from '../../logging/index.js';
import { getIntelligenceObject } from './intelligence.interface.js';

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  reason: ValidationFailureReason | null;
}

/**
 * Read a full SessionRecord from actor state storage via ephemeralState.
 * Returns null if the session does not exist.
 *
 * NOTE: ApprovedCategories and ApprovedScopes are []String fields. If the SDK
 * cannot read them via ephemeralState, they will default to empty arrays.
 */
async function readSessionFromState(
  driver: Awaited<ReturnType<typeof getLogicDriver>>,
  participantId: string,
  sessionId: string
): Promise<Session | null> {
  try {
    const exists = await driver.ephemeralState.get<boolean>(participantId, (b: any) => {
      b.entity('sessions').property(sessionId).field('Exists');
    });
    if (!exists) return null;

    const [agentId, status, purpose, issuedAt, expiresAt, remainingUses] = await Promise.all([
      driver.ephemeralState.get<string>(participantId, (b: any) => {
        b.entity('sessions').property(sessionId).field('AgentId');
      }),
      driver.ephemeralState.get<string>(participantId, (b: any) => {
        b.entity('sessions').property(sessionId).field('Status');
      }),
      driver.ephemeralState.get<string>(participantId, (b: any) => {
        b.entity('sessions').property(sessionId).field('Purpose');
      }),
      driver.ephemeralState.get<bigint>(participantId, (b: any) => {
        b.entity('sessions').property(sessionId).field('IssuedAt');
      }),
      driver.ephemeralState.get<bigint>(participantId, (b: any) => {
        b.entity('sessions').property(sessionId).field('ExpiresAt');
      }),
      driver.ephemeralState.get<bigint>(participantId, (b: any) => {
        b.entity('sessions').property(sessionId).field('RemainingUses');
      }),
    ]);

    // Array fields — attempt to read; fall back to empty if unsupported
    let approvedCategories: Category[] = [];
    let approvedScopes: string[] = [];
    try {
      const cats = await driver.ephemeralState.get<string[]>(participantId, (b: any) => {
        b.entity('sessions').property(sessionId).field('ApprovedCategories');
      });
      if (Array.isArray(cats)) approvedCategories = cats as Category[];
    } catch { /* not supported */ }
    try {
      const scopes = await driver.ephemeralState.get<string[]>(participantId, (b: any) => {
        b.entity('sessions').property(sessionId).field('ApprovedScopes');
      });
      if (Array.isArray(scopes)) approvedScopes = scopes;
    } catch { /* not supported */ }

    return {
      sessionId,
      agentId: agentId ?? '',
      status: (status ?? 'REQUESTED') as SessionStatus,
      purpose: purpose ?? '',
      approvedCategories,
      approvedScopes,
      expiresAt: Number(expiresAt ?? 0),
      remainingUses: Number(remainingUses ?? 0),
      createdAt: Number(issuedAt ?? 0),
    };
  } catch {
    // Key does not exist in storage
    return null;
  }
}

/**
 * Get a specific session for a participant
 */
export async function getSession(
  participantId: string,
  sessionId: string
): Promise<Session | null> {
  const logger = getLogger().child({ interface: 'sessions' });
  logger.debug({ participantId, sessionId }, 'getSession');

  try {
    const driver = await getLogicDriver();
    return await readSessionFromState(driver, participantId, sessionId);
  } catch (error) {
    logger.error({ participantId, sessionId, error }, 'Failed to get session');
    throw error;
  }
}

/**
 * Get all sessions for a participant
 */
export async function getSessions(participantId: string): Promise<Session[]> {
  const logger = getLogger().child({ interface: 'sessions' });
  logger.debug({ participantId }, 'getSessions');

  try {
    const intelligenceObj = await getIntelligenceObject(participantId);
    return intelligenceObj?.sessions ?? [];
  } catch (error) {
    logger.error({ participantId, error }, 'Failed to get sessions');
    throw error;
  }
}

/**
 * Find an existing valid session that satisfies the requirements
 */
export async function findValidSession(
  participantId: string,
  agentId: string,
  requiredCategories: Category[],
  requiredScopes: string[],
  currentTime: number
): Promise<Session | null> {
  const logger = getLogger().child({ interface: 'sessions' });
  logger.debug(
    { participantId, agentId, requiredCategories, requiredScopes },
    'findValidSession'
  );

  const sessions = await getSessions(participantId);

  for (const session of sessions) {
    if (
      session.status === 'ACTIVE' &&
      session.agentId === agentId &&
      session.expiresAt > currentTime &&
      session.remainingUses > 0 &&
      isSubset(requiredCategories, session.approvedCategories) &&
      isSubset(requiredScopes, session.approvedScopes)
    ) {
      return session;
    }
  }

  return null;
}

/**
 * Validate a session against requirements.
 * Reads session from state directly and validates locally (contract static call is broken on devnet).
 */
export async function validateSession(
  participantId: string,
  sessionId: string,
  agentId: string,
  requiredCategories: Category[],
  requiredScopes: string[],
  currentTime: number
): Promise<SessionValidationResult> {
  const logger = getLogger().child({ interface: 'sessions' });
  logger.debug(
    { participantId, sessionId, agentId, requiredCategories, requiredScopes },
    'validateSession'
  );

  try {
    const driver = await getLogicDriver();
    const session = await readSessionFromState(driver, participantId, sessionId);

    if (!session) {
      return { valid: false, reason: 'not_found' };
    }

    if (session.status !== 'ACTIVE') {
      return { valid: false, reason: 'wrong_status' };
    }

    if (session.agentId !== agentId) {
      return { valid: false, reason: 'agent_mismatch' };
    }

    if (currentTime > session.expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    if (session.remainingUses === 0) {
      return { valid: false, reason: 'exhausted' };
    }

    if (!isSubset(requiredCategories, session.approvedCategories)) {
      return { valid: false, reason: 'missing_category' };
    }

    if (!isSubset(requiredScopes, session.approvedScopes)) {
      return { valid: false, reason: 'missing_scope' };
    }

    return { valid: true, reason: null };
  } catch (error) {
    logger.error(
      { participantId, sessionId, agentId, error },
      'Failed to validate session'
    );
    throw error;
  }
}
