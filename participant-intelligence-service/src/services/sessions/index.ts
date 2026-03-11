/**
 * Sessions Service
 *
 * Handles session lifecycle management and validation.
 */

import type { IMoiSdkAdapter } from '../../adapters/moi-sdk/index.js';
import { getMoiSdkAdapter } from '../../adapters/moi-sdk/index.js';
import type {
  Session,
  EnsureSessionRequest,
  EnsureSessionResponse,
  ValidateSessionRequest,
  ValidateSessionResponse,
} from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import { getCurrentTimestamp, generateSessionId, computeSigningDigest, generateNonce } from '../../utils/index.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

export interface ISessionsService {
  getSession(participantId: string, sessionId: string): Promise<Session | null>;
  ensureSession(request: EnsureSessionRequest): Promise<EnsureSessionResponse>;
  validateSession(request: ValidateSessionRequest): Promise<ValidateSessionResponse>;
}

export class SessionsService implements ISessionsService {
  private logger = getLogger().child({ service: 'sessions' });
  private adapter: IMoiSdkAdapter;
  private config = getConfig();

  constructor(adapter?: IMoiSdkAdapter) {
    this.adapter = adapter ?? getMoiSdkAdapter();
  }

  /**
   * Get a specific session by ID
   */
  async getSession(participantId: string, sessionId: string): Promise<Session | null> {
    this.logger.info({ participantId, sessionId }, 'Fetching session');

    try {
      const session = await this.adapter.getSession(participantId, sessionId);

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
   * Ensure a session exists for the agent with required access
   *
   * If a valid existing session satisfies the requirements, returns approved.
   * Otherwise, returns a signable write request for session creation.
   */
  async ensureSession(request: EnsureSessionRequest): Promise<EnsureSessionResponse> {
    const {
      participantId,
      agentId,
      purpose,
      requiredCategories,
      requiredScopes,
      requestedUses,
      ttlSeconds,
    } = request;

    this.logger.info(
      { participantId, agentId, purpose, requiredCategories },
      'Ensuring session'
    );

    try {
      const currentTime = getCurrentTimestamp();

      // Check for existing valid session
      const existingSession = await this.adapter.findValidSession(
        participantId,
        agentId,
        requiredCategories,
        requiredScopes,
        currentTime
      );

      if (existingSession) {
        this.logger.info(
          { participantId, agentId, sessionId: existingSession.sessionId },
          'Found existing valid session'
        );

        return {
          status: 'approved',
          sessionId: existingSession.sessionId,
        };
      }

      // No valid session exists, prepare a write request
      this.logger.info(
        { participantId, agentId },
        'No valid session found, preparing write request'
      );

      const sessionId = generateSessionId();
      const mapping = ACTION_METHOD_MAP['create_session_request'];
      const nonce = generateNonce();

      const args = {
        sessionId,
        agentId,
        purpose,
        requiredCategories,
        requiredScopes,
        requestedUses,
        ttlSeconds,
      };

      const payload = {
        contract: mapping.contract,
        method: mapping.method,
        args,
        participantId,
        nonce,
      };

      const signingDigest = computeSigningDigest(payload);
      const categoryList = requiredCategories.join(' and ');

      return {
        status: 'pending_signature',
        sessionId,
        message: `Please approve access to ${categoryList} for ${purpose}.`,
        writeRequest: {
          action: 'create_session_request',
          summary: `Approve agent access for ${categoryList}`,
          payload,
          signingDigest,
        },
      };
    } catch (error) {
      this.logger.error({ participantId, agentId, error }, 'Failed to ensure session');
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
      const result = await this.adapter.validateSession(
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
