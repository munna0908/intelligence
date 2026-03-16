/**
 * Intelligence Service
 *
 * Handles reading participant intelligence object state and category references.
 */

import * as moiInterface from '../moi/interface/intelligence.interface.js';
import * as mockInterface from '../moi/interface/mock.interface.js';
import type {
  IntelligenceObjectSummary,
  CategoryRefsResponse,
} from '../domain/models.js';
import type { Category } from '../domain/types.js';
import { getConfig } from '../config/index.js';
import { getLogger } from '../logging/index.js';

export interface IIntelligenceService {
  getIntelligenceObject(participantId: string): Promise<IntelligenceObjectSummary | null>;
  getCategoryRefs(participantId: string, categories: Category[]): Promise<CategoryRefsResponse>;
}

export class IntelligenceService implements IIntelligenceService {
  private logger = getLogger().child({ service: 'intelligence' });
  private useMock: boolean;

  constructor() {
    this.useMock = getConfig().moi.useMockAdapter;
  }

  /**
   * Get the full intelligence object summary for a participant
   */
  async getIntelligenceObject(participantId: string): Promise<IntelligenceObjectSummary | null> {
    this.logger.info({ participantId }, 'Fetching intelligence object');

    try {
      const result = this.useMock
        ? await mockInterface.mockGetIntelligenceObject(participantId)
        : await moiInterface.getIntelligenceObject(participantId);

      if (!result) {
        this.logger.info({ participantId }, 'Intelligence object not found');
        return null;
      }

      this.logger.info(
        {
          participantId,
          categoryCount: Object.keys(result.categoryRefs).length,
          sessionCount: result.sessions.length,
        },
        'Intelligence object retrieved'
      );

      return result;
    } catch (error) {
      this.logger.error({ participantId, error }, 'Failed to fetch intelligence object');
      throw error;
    }
  }

  /**
   * Get specific category references for a participant
   */
  async getCategoryRefs(
    participantId: string,
    categories: Category[]
  ): Promise<CategoryRefsResponse> {
    this.logger.info({ participantId, categories }, 'Fetching category refs');

    try {
      const categoryRefs = this.useMock
        ? await mockInterface.mockGetCategoryRefs(participantId, categories)
        : await moiInterface.getCategoryRefs(participantId, categories);

      this.logger.info(
        {
          participantId,
          requestedCategories: categories,
          foundCategories: Object.keys(categoryRefs),
        },
        'Category refs retrieved'
      );

      return {
        participantId,
        categoryRefs,
      };
    } catch (error) {
      this.logger.error({ participantId, categories, error }, 'Failed to fetch category refs');
      throw error;
    }
  }
}

// Singleton service instance
let serviceInstance: IntelligenceService | null = null;

export function getIntelligenceService(): IntelligenceService {
  if (!serviceInstance) {
    serviceInstance = new IntelligenceService();
  }
  return serviceInstance;
}

export function resetIntelligenceService(): void {
  serviceInstance = null;
}
