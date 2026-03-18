/**
 * Sessions Service
 *
 * Handles session lifecycle management and validation.
 */

import * as moiInterface from '../moi/interface/sessions.interface.js';
import * as mockInterface from '../moi/interface/mock.interface.js';
import type {
  Session,
  ValidateSessionRequest,
  ValidateSessionResponse,
} from '../domain/models.js';
import { getConfig } from '../config/index.js';
import { getLogger } from '../logging/index.js';

export interface ISessionsService {
  getSession(participantId: string, sessionId: string): Promise<Session | null>;
  validateSession(request: ValidateSessionRequest): Promise<ValidateSessionResponse>;
}

export class SessionsService implements ISessionsService {
  private logger = getLogger().child({ service: 'sessions' });
  private useMock: boolean;

  constructor() {
    this.useMock = getConfig().moi.useMockAdapter;
  }

  /**
   * Get a specific session by ID
   */
  async getSession(participantId: string, sessionId: string): Promise<Session | null> {
    this.logger.info({ participantId, sessionId }, 'Fetching session');

    try {
      const session = this.useMock
        ? await mockInterface.mockGetSession(participantId, sessionId)
        : await moiInterface.getSession(participantId, sessionId);

      if (!session) {
        this.logger.info({ participantId, sessionId }, 'Session not found');
        return null;
      }

      this.logger.info(
        { participantId, sessionId, status: session.status },
        'Session retrieved'
      );

      return session;
    } catch (error) {
      this.logger.error({ participantId, sessionId, error }, 'Failed to fetch session');
      throw error;
    }
  }

  /**
   * Validate a session for the Inference Service
   *
   * Checks all session validity rules:
   * - Session exists
   * - Status is ACTIVE
   * - Agent matches
   * - Not expired
   * - Has remaining uses
   * - Has required categories
   * - Has required scopes
   */
  async validateSession(request: ValidateSessionRequest): Promise<ValidateSessionResponse> {
    const {
      participantId,
      agentId,
      sessionId,
      requiredCategories,
      requiredScopes,
      currentTime,
    } = request;

    this.logger.info(
      { participantId, agentId, sessionId, requiredCategories },
      'Validating session'
    );

    try {
      const result = this.useMock
        ? await mockInterface.mockValidateSession(
            participantId,
            sessionId,
            agentId,
            requiredCategories,
            requiredScopes,
            currentTime
          )
        : await moiInterface.validateSession(
            participantId,
            sessionId,
            agentId,
            requiredCategories,
            requiredScopes,
            currentTime
          );

      this.logger.info(
        {
          participantId,
          sessionId,
          valid: result.valid,
          reason: result.reason,
        },
        'Session validation complete'
      );

      return result;
    } catch (error) {
      this.logger.error(
        { participantId, sessionId, agentId, error },
        'Failed to validate session'
      );
      throw error;
    }
  }
}

// Singleton service instance
let serviceInstance: SessionsService | null = null;

export function getSessionsService(): SessionsService {
  if (!serviceInstance) {
    serviceInstance = new SessionsService();
  }
  return serviceInstance;
}

export function resetSessionsService(): void {
  serviceInstance = null;
}
