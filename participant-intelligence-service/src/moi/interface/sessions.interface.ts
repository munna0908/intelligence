/**
 * Sessions MOI Interface
 *
 * Handles MOI network interactions for session operations.
 */

// Note: Pass hex strings directly to routines, not Identifier objects
import { getLogicDriver } from '../config/provider.config.js';
import type { Session } from '../../domain/models.js';
import type { Category, SessionStatus, ValidationFailureReason } from '../../domain/types.js';
import { isSubset } from '../../utils/crypto.utils.js';
import { getLogger } from '../../logging/index.js';
import { getIntelligenceObject } from './intelligence.interface.js';

/**
 * Contract response types
 */
interface ContractSessionRecord {
  SessionId: string;
  AgentId: string;
  Status: string;
  Purpose: string;
  ApprovedCategories: string[];
  ApprovedScopes: string[];
  IssuedAt: bigint | number;
  ExpiresAt: bigint | number;
  RemainingUses: bigint | number;
  ApprovalRef: string;
  RevocationReason: string;
  Exists: boolean;
}

interface ContractValidationResult {
  Valid: boolean;
  Reason: string;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  reason: ValidationFailureReason | null;
}

/**
 * Convert bigint to number safely
 */
function toNumber(value: bigint | number): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

/**
 * Map contract SessionRecord to domain model
 */
function mapSession(record: ContractSessionRecord): Session {
  return {
    sessionId: record.SessionId,
    agentId: record.AgentId,
    status: record.Status as SessionStatus,
    purpose: record.Purpose,
    approvedCategories: record.ApprovedCategories as Category[],
    approvedScopes: record.ApprovedScopes,
    expiresAt: toNumber(record.ExpiresAt),
    remainingUses: toNumber(record.RemainingUses),
    createdAt: toNumber(record.IssuedAt),
  };
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

    const getSessionFn = driver.routines['GetSession'];
    if (!getSessionFn) {
      throw new Error('GetSession routine not found');
    }

    const response = await getSessionFn(participantId, sessionId) as { output: { session: ContractSessionRecord } | null; error: unknown };

    logger.info({ response: JSON.stringify(response, (_, v) => typeof v === 'bigint' ? v.toString() : v) }, 'GetSession raw response');

    // Handle contract errors
    if (response.error || !response.output) {
      logger.info({ error: response.error, hasOutput: !!response.output }, 'GetSession returning null - error or no output');
      return null;
    }

    const record = response.output.session;
    if (!record || !record.Exists) {
      logger.info({ record, exists: record?.Exists }, 'GetSession returning null - no record or not exists');
      return null;
    }

    logger.info({ record }, 'GetSession returning session');
    return mapSession(record);
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
 * Validate a session against requirements using the on-chain validator
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

    const validateSessionFn = driver.routines['ValidateSession'];
    if (!validateSessionFn) {
      throw new Error('ValidateSession routine not found');
    }

    const response = await validateSessionFn(
      participantId,
      sessionId,
      agentId,
      requiredCategories,
      requiredScopes,
      BigInt(currentTime)
    ) as { output: ContractValidationResult | null; error: unknown };

    // Handle contract errors
    if (response.error || !response.output) {
      return { valid: false, reason: 'not_found' };
    }

    const result = response.output;

    const reasonMap: Record<string, SessionValidationResult['reason']> = {
      'valid': null,
      'not_found': 'not_found',
      'wrong_status': 'wrong_status',
      'agent_mismatch': 'agent_mismatch',
      'expired': 'expired',
      'exhausted': 'exhausted',
      'missing_category': 'missing_category',
      'missing_scope': 'missing_scope',
    };

    return {
      valid: result.Valid,
      reason: result.Valid ? null : (reasonMap[result.Reason] ?? 'not_found'),
    };
  } catch (error) {
    logger.error(
      { participantId, sessionId, agentId, error },
      'Failed to validate session'
    );
    throw error;
  }
}
