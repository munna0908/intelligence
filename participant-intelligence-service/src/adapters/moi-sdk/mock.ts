/**
 * Mock MOI SDK Adapter
 *
 * This mock implementation allows the service to run locally without a real MOI network.
 * It simulates the behavior of the ParticipantIntelligenceEngine contract.
 */

import type {
  IMoiSdkAdapter,
  PreparedWrite,
  SubmitWriteResult,
  SessionValidationResult,
} from './interface.js';
import type {
  IntelligenceObjectSummary,
  CategoryRef,
  Session,
  WritePayload,
} from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import type { Category, WriteAction, TransactionStatus } from '../../domain/types.js';
import {
  generateSessionId,
  generateNonce,
  generateTxHash,
  computeSigningDigest,
  getCurrentTimestamp,
  isSubset,
} from '../../utils/index.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

interface MockParticipantState {
  participantId: string;
  version: string;
  categoryRefs: Partial<Record<Category, CategoryRef>>;
  sessions: Session[];
  metadata: {
    updatedAt: number;
  };
}

interface MockTransaction {
  txHash: string;
  status: TransactionStatus;
  submittedAt: number;
}

/**
 * In-memory store for mock data
 */
class MockStore {
  private participants: Map<string, MockParticipantState> = new Map();
  private transactions: Map<string, MockTransaction> = new Map();
  private pendingWrites: Map<string, PreparedWrite> = new Map();

  constructor() {
    // Initialize with sample participant data
    this.seedMockData();
  }

  private seedMockData(): void {
    const now = getCurrentTimestamp();

    // Sample participant with existing data
    this.participants.set('participant_001', {
      participantId: 'participant_001',
      version: '1.0',
      categoryRefs: {
        FOOD: {
          ref: 'bafy_food_cid_001',
          schemaVersion: '1.0',
          updatedAt: now - 3600,
        },
        HEALTH: {
          ref: 'bafy_health_cid_001',
          schemaVersion: '1.0',
          updatedAt: now - 7200,
        },
      },
      sessions: [
        {
          sessionId: 'sess_existing_001',
          agentId: 'openclaw_whatsapp_bot',
          status: 'ACTIVE',
          purpose: 'food_ordering',
          approvedCategories: ['FOOD', 'HEALTH'],
          approvedScopes: ['preferences.food.read', 'health.read'],
          expiresAt: now + 3600,
          remainingUses: 5,
          createdAt: now - 1800,
        },
      ],
      metadata: {
        updatedAt: now - 3600,
      },
    });

    // Another sample participant
    this.participants.set('participant_002', {
      participantId: 'participant_002',
      version: '1.0',
      categoryRefs: {
        ADDRESS: {
          ref: 'bafy_address_cid_002',
          schemaVersion: '1.0',
          updatedAt: now - 1800,
        },
        PAYMENT: {
          ref: 'bafy_payment_cid_002',
          schemaVersion: '1.0',
          updatedAt: now - 1800,
        },
      },
      sessions: [],
      metadata: {
        updatedAt: now - 1800,
      },
    });
  }

  getParticipant(participantId: string): MockParticipantState | undefined {
    return this.participants.get(participantId);
  }

  setParticipant(participantId: string, state: MockParticipantState): void {
    this.participants.set(participantId, state);
  }

  getTransaction(txHash: string): MockTransaction | undefined {
    return this.transactions.get(txHash);
  }

  addTransaction(tx: MockTransaction): void {
    this.transactions.set(tx.txHash, tx);
  }

  updateTransactionStatus(txHash: string, status: TransactionStatus): void {
    const tx = this.transactions.get(txHash);
    if (tx) {
      tx.status = status;
    }
  }

  getPendingWrite(nonce: string): PreparedWrite | undefined {
    return this.pendingWrites.get(nonce);
  }

  addPendingWrite(nonce: string, write: PreparedWrite): void {
    this.pendingWrites.set(nonce, write);
  }

  removePendingWrite(nonce: string): void {
    this.pendingWrites.delete(nonce);
  }

  // For testing: reset to initial state
  reset(): void {
    this.participants.clear();
    this.transactions.clear();
    this.pendingWrites.clear();
    this.seedMockData();
  }

  // For testing: add or update participant
  upsertParticipant(state: MockParticipantState): void {
    this.participants.set(state.participantId, state);
  }
}

// Singleton store instance
const mockStore = new MockStore();

export class MockMoiSdkAdapter implements IMoiSdkAdapter {
  private logger = getLogger().child({ adapter: 'mock-moi-sdk' });

  async getIntelligenceObject(participantId: string): Promise<IntelligenceObjectSummary | null> {
    this.logger.debug({ participantId }, 'getIntelligenceObject');

    const participant = mockStore.getParticipant(participantId);
    if (!participant) {
      return null;
    }

    return {
      participantId: participant.participantId,
      version: participant.version,
      categoryRefs: participant.categoryRefs,
      sessions: participant.sessions,
      metadata: participant.metadata,
    };
  }

  async getCategoryRefs(
    participantId: string,
    categories: Category[]
  ): Promise<Partial<Record<Category, CategoryRef>>> {
    this.logger.debug({ participantId, categories }, 'getCategoryRefs');

    const participant = mockStore.getParticipant(participantId);
    if (!participant) {
      return {};
    }

    const result: Partial<Record<Category, CategoryRef>> = {};
    for (const category of categories) {
      const ref = participant.categoryRefs[category];
      if (ref) {
        result[category] = ref;
      }
    }

    return result;
  }

  async getSession(participantId: string, sessionId: string): Promise<Session | null> {
    this.logger.debug({ participantId, sessionId }, 'getSession');

    const participant = mockStore.getParticipant(participantId);
    if (!participant) {
      return null;
    }

    return participant.sessions.find((s) => s.sessionId === sessionId) ?? null;
  }

  async getSessions(participantId: string): Promise<Session[]> {
    this.logger.debug({ participantId }, 'getSessions');

    const participant = mockStore.getParticipant(participantId);
    if (!participant) {
      return [];
    }

    return participant.sessions;
  }

  async findValidSession(
    participantId: string,
    agentId: string,
    requiredCategories: Category[],
    requiredScopes: string[],
    currentTime: number
  ): Promise<Session | null> {
    this.logger.debug(
      { participantId, agentId, requiredCategories, requiredScopes },
      'findValidSession'
    );

    const participant = mockStore.getParticipant(participantId);
    if (!participant) {
      return null;
    }

    // Find a session that satisfies all requirements
    for (const session of participant.sessions) {
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

  async validateSession(
    participantId: string,
    sessionId: string,
    agentId: string,
    requiredCategories: Category[],
    requiredScopes: string[],
    currentTime: number
  ): Promise<SessionValidationResult> {
    this.logger.debug(
      { participantId, sessionId, agentId, requiredCategories, requiredScopes },
      'validateSession'
    );

    const session = await this.getSession(participantId, sessionId);

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

    if (session.remainingUses <= 0) {
      return { valid: false, reason: 'exhausted' };
    }

    if (!isSubset(requiredCategories, session.approvedCategories)) {
      return { valid: false, reason: 'missing_category' };
    }

    if (!isSubset(requiredScopes, session.approvedScopes)) {
      return { valid: false, reason: 'missing_scope' };
    }

    return { valid: true, reason: null };
  }

  async prepareContractWrite(
    action: WriteAction,
    params: Record<string, unknown>,
    participantId: string
  ): Promise<PreparedWrite> {
    this.logger.debug({ action, participantId }, 'prepareContractWrite');

    const config = getConfig();
    const mapping = ACTION_METHOD_MAP[action];
    const nonce = generateNonce();
    const now = getCurrentTimestamp();

    const payload: WritePayload = {
      contract: mapping.contract,
      method: mapping.method,
      args: params,
      participantId,
      nonce,
    };

    const signingDigest = computeSigningDigest(payload);
    const expiresAt = now + config.writeRequest.ttlSeconds;

    const preparedWrite: PreparedWrite = {
      contract: mapping.contract,
      method: mapping.method,
      args: params,
      payload,
      signingDigest,
      expiresAt,
    };

    // Store for later validation during submit
    mockStore.addPendingWrite(nonce, preparedWrite);

    return preparedWrite;
  }

  async submitSignedWrite(payload: WritePayload, signature: string): Promise<SubmitWriteResult> {
    this.logger.debug(
      { contract: payload.contract, method: payload.method, nonce: payload.nonce },
      'submitSignedWrite'
    );

    // Validate the pending write exists
    const pendingWrite = mockStore.getPendingWrite(payload.nonce);
    if (!pendingWrite) {
      return { success: false, error: 'Invalid or expired write request' };
    }

    // Check expiry
    const now = getCurrentTimestamp();
    if (now > pendingWrite.expiresAt) {
      mockStore.removePendingWrite(payload.nonce);
      return { success: false, error: 'Write request has expired' };
    }

    // Verify signature (mock: just check it's not empty)
    if (!signature || signature.length < 10) {
      return { success: false, error: 'Invalid signature' };
    }

    // Simulate transaction submission
    const txHash = generateTxHash();

    mockStore.addTransaction({
      txHash,
      status: 'pending',
      submittedAt: now,
    });

    // Apply the state change based on method
    this.applyStateChange(payload);

    // Simulate confirmation after a short delay (in real impl, this would be async)
    setTimeout(() => {
      mockStore.updateTransactionStatus(txHash, 'confirmed');
    }, 100);

    mockStore.removePendingWrite(payload.nonce);

    return { success: true, txHash };
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    this.logger.debug({ txHash }, 'getTransactionStatus');

    const tx = mockStore.getTransaction(txHash);
    if (!tx) {
      return 'pending'; // Unknown tx treated as pending
    }

    return tx.status;
  }

  /**
   * Apply state changes based on the method being called
   */
  private applyStateChange(payload: WritePayload): void {
    const participant = mockStore.getParticipant(payload.participantId);
    const now = getCurrentTimestamp();

    // Create participant if doesn't exist
    const state: MockParticipantState = participant ?? {
      participantId: payload.participantId,
      version: '1.0',
      categoryRefs: {},
      sessions: [],
      metadata: { updatedAt: now },
    };

    switch (payload.method) {
      case 'SetCategoryRef': {
        const args = payload.args as {
          category: Category;
          ref: string;
          schemaVersion: string;
          updatedAt: number;
        };
        state.categoryRefs[args.category] = {
          ref: args.ref,
          schemaVersion: args.schemaVersion,
          updatedAt: args.updatedAt,
        };
        state.metadata.updatedAt = now;
        break;
      }

      case 'CreateSessionRequest': {
        const args = payload.args as {
          agentId: string;
          purpose: string;
          requiredCategories: Category[];
          requiredScopes: string[];
          requestedUses: number;
          ttlSeconds: number;
        };
        const newSession: Session = {
          sessionId: generateSessionId(),
          agentId: args.agentId,
          status: 'PENDING',
          purpose: args.purpose,
          approvedCategories: args.requiredCategories,
          approvedScopes: args.requiredScopes,
          expiresAt: now + args.ttlSeconds,
          remainingUses: args.requestedUses,
          createdAt: now,
        };
        state.sessions.push(newSession);
        state.metadata.updatedAt = now;
        break;
      }

      case 'ApproveSession': {
        const args = payload.args as { sessionId: string };
        const session = state.sessions.find((s) => s.sessionId === args.sessionId);
        if (session) {
          session.status = 'ACTIVE';
          state.metadata.updatedAt = now;
        }
        break;
      }

      case 'DenySession': {
        const args = payload.args as { sessionId: string };
        const session = state.sessions.find((s) => s.sessionId === args.sessionId);
        if (session) {
          session.status = 'DENIED';
          state.metadata.updatedAt = now;
        }
        break;
      }

      case 'RevokeSession': {
        const args = payload.args as { sessionId: string };
        const session = state.sessions.find((s) => s.sessionId === args.sessionId);
        if (session) {
          session.status = 'REVOKED';
          state.metadata.updatedAt = now;
        }
        break;
      }
    }

    mockStore.setParticipant(payload.participantId, state);
  }
}

// Export mock store for testing
export { mockStore, MockStore };
