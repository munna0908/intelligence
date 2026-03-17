/**
 * Intelligence MOI Interface
 *
 * Handles MOI network interactions for intelligence object operations.
 */

// Note: Pass hex strings directly to routines, not Identifier objects
import { getLogicDriver, getProvider } from '../config/provider.config.js';
import type {
  IntelligenceObjectSummary,
  CategoryRef,
  Session,
} from '../../domain/models.js';
import type { Category, SessionStatus } from '../../domain/types.js';
import { getLogger } from '../../logging/index.js';

/**
 * Contract response types matching the Coco contract structures
 */
interface ContractCategoryRef {
  Category: string;
  Ref: string;
  SchemaVersion: string;
  LastUpdated: bigint | number;
  Exists: boolean;
}

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

interface ContractIntelligenceObject {
  ActorId: string;
  Version: bigint | number;
  CategoryRefs: ContractCategoryRef[];
  ActiveSessions: Array<{
    SessionId: string;
    AgentId: string;
    Status: string;
    Purpose: string;
    ExpiresAt: bigint | number;
  }>;
  LastUpdatedAt: bigint | number;
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
 * Map contract CategoryRef to domain model
 */
function mapCategoryRef(ref: ContractCategoryRef): CategoryRef {
  return {
    ref: ref.Ref,
    schemaVersion: ref.SchemaVersion,
    updatedAt: toNumber(ref.LastUpdated),
  };
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
 * Get the full intelligence object for a participant
 */
export async function getIntelligenceObject(
  participantId: string
): Promise<IntelligenceObjectSummary | null> {
  const logger = getLogger().child({ interface: 'intelligence' });
  logger.debug({ participantId }, 'getIntelligenceObject');

  try {
    const driver = await getLogicDriver();

    const routineFn = driver.routines['GetIntelligenceObject'];
    if (!routineFn) {
      throw new Error('GetIntelligenceObject routine not found');
    }

    const response = await routineFn(participantId) as { output: ContractIntelligenceObject | null; error: unknown };

    // Handle contract errors (e.g., participant doesn't exist)
    if (response.error || !response.output) {
      logger.debug({ participantId, error: response.error }, 'Participant not found or contract error');
      return null;
    }

    const result = response.output;

    if (!result || toNumber(result.Version) === 0) {
      return null;
    }

    // Map category refs
    const categoryRefs: Partial<Record<Category, CategoryRef>> = {};
    const refs = result.CategoryRefs ?? [];
    for (const ref of refs) {
      if (ref.Exists) {
        categoryRefs[ref.Category as Category] = mapCategoryRef(ref);
      }
    }

    // Get active sessions
    const sessions: Session[] = [];
    const getSessionFn = driver.routines['GetSession'];
    const activeSessions = result.ActiveSessions ?? [];

    if (getSessionFn && activeSessions.length > 0) {
      for (const summary of activeSessions) {
        const sessionResponse = await getSessionFn(participantId, summary.SessionId) as { output: { session: ContractSessionRecord } | null; error: unknown };
        if (sessionResponse.output?.session?.Exists) {
          sessions.push(mapSession(sessionResponse.output.session));
        }
      }
    }

    return {
      participantId,
      version: toNumber(result.Version).toString(),
      categoryRefs,
      sessions,
      metadata: {
        updatedAt: toNumber(result.LastUpdatedAt),
      },
    };
  } catch (error) {
    logger.error({ participantId, error }, 'Failed to get intelligence object');
    throw error;
  }
}

/**
 * Get specific category references for a participant
 */
export async function getCategoryRefs(
  participantId: string,
  categories: Category[]
): Promise<Partial<Record<Category, CategoryRef>>> {
  const logger = getLogger().child({ interface: 'intelligence' });
  logger.debug({ participantId, categories }, 'getCategoryRefs');

  try {
    const driver = await getLogicDriver();
    const result: Partial<Record<Category, CategoryRef>> = {};

    const getCategoryRefFn = driver.routines['GetCategoryRef'];
    if (!getCategoryRefFn) {
      throw new Error('GetCategoryRef routine not found');
    }

    for (const category of categories) {
      const response = await getCategoryRefFn(participantId, category) as { output: { cat_ref: ContractCategoryRef } | null; error: unknown };
      if (response.output?.cat_ref?.Exists) {
        result[category] = mapCategoryRef(response.output.cat_ref);
      }
    }

    return result;
  } catch (error) {
    logger.error({ participantId, categories, error }, 'Failed to get category refs');
    throw error;
  }
}
