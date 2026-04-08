/**
 * Intelligence MOI Interface
 *
 * Handles MOI network interactions for intelligence object operations.
 */

import { Hex, LockType } from 'js-moi-sdk';
import { getLogicDriver } from '../config/provider.config.js';
import type {
  IntelligenceObjectSummary,
  CategoryRef,
} from '../../domain/models.js';
import type { Category, CATEGORIES } from '../../domain/types.js';
import { getLogger } from '../../logging/index.js';

interface ContractCategoryRef {
  Category: string;
  Ref: string;
  SchemaVersion: string;
  LastUpdated: bigint | number;
  UpdatedBy: string;
  Exists: boolean;
}

/**
 * Get the full intelligence object for a participant.
 *
 * NOTE: GetIntelligenceObject contract routine exhausts the devnet fuel meter
 * for participants with data (builtin.MeterExhausted). We build the summary
 * from individual GetCategoryRef calls instead — those are lightweight and
 * already proven to work (see get-category-refs.js test script).
 */
export async function getIntelligenceObject(
  participantId: string
): Promise<IntelligenceObjectSummary | null> {
  const logger = getLogger().child({ interface: 'intelligence' });
  logger.debug({ participantId }, 'getIntelligenceObject');

  try {
    const categoryRefs = await getCategoryRefs(participantId, [...CATEGORIES]);

    // If no category refs exist the participant has no on-chain data
    if (Object.keys(categoryRefs).length === 0) {
      logger.info({ participantId }, 'No category refs found — participant not found');
      return null;
    }

    logger.info({ participantId, categories: Object.keys(categoryRefs) }, 'Intelligence object built from category refs');

    return {
      participantId,
      version: '1',
      categoryRefs,
      sessions: [], // sessions are validated separately via ephemeralState (validateSession)
      metadata: {
        updatedAt: Math.floor(Date.now() / 1000),
      },
    };
  } catch (error) {
    logger.error({ participantId, error }, 'Failed to get intelligence object');
    throw error;
  }
}

/**
 * Get specific category references for a participant.
 *
 * Calls GetCategoryRef in parallel — one lightweight routine call per category.
 * (GetIntelligenceObject exhausts the devnet fuel meter; GetCategoryRef does not.)
 */
export async function getCategoryRefs(
  participantId: string,
  categories: Category[]
): Promise<Partial<Record<Category, CategoryRef>>> {
  const logger = getLogger().child({ interface: 'intelligence' });
  logger.debug({ participantId, categories }, 'getCategoryRefs');

  try {
    const driver = await getLogicDriver();

    const getCategoryRefFn = driver.routines['GetCategoryRef'];
    if (!getCategoryRefFn) {
      throw new Error('GetCategoryRef routine not found');
    }

    const entries = await Promise.all(
      categories.map(async (category) => {
        try {
          const ctx = getCategoryRefFn(participantId, category);
          const callResponse = await ctx.call({
            participants: [{ id: participantId as Hex, lock_type: LockType.MUTATE_LOCK }],
          });
          const raw = await callResponse.result() as any;
          const ref: ContractCategoryRef | null =
            raw?.output?.cat_ref ?? raw?.cat_ref ?? null;
          if (ref?.Exists && ref.Ref) {
            return [category, {
              ref: ref.Ref,
              schemaVersion: ref.SchemaVersion ?? '1.0',
              updatedAt: typeof ref.LastUpdated === 'bigint' ? Number(ref.LastUpdated) : (ref.LastUpdated ?? 0),
              updatedBy: ref.UpdatedBy ?? '',
            }] as [Category, CategoryRef];
          }
          return null;
        } catch (err) {
          logger.debug({ participantId, category, error: err }, 'GetCategoryRef failed, skipping');
          return null;
        }
      })
    );

    const result: Partial<Record<Category, CategoryRef>> = {};
    for (const entry of entries) {
      if (entry) result[entry[0]] = entry[1];
    }
    return result;
  } catch (error) {
    logger.error({ participantId, categories, error }, 'Failed to get category refs');
    throw error;
  }
}
