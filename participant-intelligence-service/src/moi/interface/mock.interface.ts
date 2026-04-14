/**
 * Mock MOI Interface
 *
 * Provides mock implementations for local development without a real MOI network.
 */

import type {
  IntelligenceObjectSummary,
  CategoryRef,
  Session,
  TransactionStatus,
  InteractionObject,
  InteractionRequest,
} from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import type { Category, WriteAction, ValidationFailureReason, SessionStatus } from '../../domain/types.js';
import {
  generateSessionId,
  generateTxHash,
  getCurrentTimestamp,
  isSubset,
} from '../../utils/crypto.utils.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';
import type { PreparedWrite, SubmitWriteResult, SessionValidationResult } from './index.js';
import { OpType } from 'js-moi-sdk';

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

// Internal payload used only for mock state simulation
interface MockWritePayload {
  method: string;
  args: Record<string, unknown>;
  participantId: string;
}

/**
 * In-memory store for mock data
 */
class MockStore {
  private participants: Map<string, MockParticipantState> = new Map();
  private transactions: Map<string, MockTransaction> = new Map();
  // Maps mock tx hash → pending write payload for state simulation
  private pendingMockWrites: Map<string, MockWritePayload> = new Map();

  constructor() {
    this.seedMockData();
  }

  private seedMockData(): void {
    const now = getCurrentTimestamp();

    this.participants.set('participant_001', {
      participantId: 'participant_001',
      version: '1.0',
      categoryRefs: {
        FOOD: {
          ref: 'bafy_food_cid_001',
          schemaVersion: '1.0',
          updatedAt: now - 3600,
          updatedBy: 'swiggy',
        },
        HEALTH: {
          ref: 'bafy_health_cid_001',
          schemaVersion: '1.0',
          updatedAt: now - 7200,
          updatedBy: 'my diet app',
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

    this.participants.set('participant_002', {
      participantId: 'participant_002',
      version: '1.0',
      categoryRefs: {
        ADDRESS: {
          ref: 'bafy_address_cid_002',
          schemaVersion: '1.0',
          updatedAt: now - 1800,
          updatedBy: 'addressbook',
        },
        SCHEDULE: {
          ref: 'bafy_schedule_cid_002',
          schemaVersion: '1.0',
          updatedAt: now - 1800,
          updatedBy: 'daybook',
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

  getPendingMockWrite(txHash: string): MockWritePayload | undefined {
    return this.pendingMockWrites.get(txHash);
  }

  addPendingMockWrite(txHash: string, payload: MockWritePayload): void {
    this.pendingMockWrites.set(txHash, payload);
  }

  removePendingMockWrite(txHash: string): void {
    this.pendingMockWrites.delete(txHash);
  }

  reset(): void {
    this.participants.clear();
    this.transactions.clear();
    this.pendingMockWrites.clear();
    this.seedMockData();
  }
}

const mockStore = new MockStore();

// Mock implementations of interface functions

export async function mockGetIntelligenceObject(
  participantId: string
): Promise<IntelligenceObjectSummary | null> {
  const logger = getLogger().child({ interface: 'mock-intelligence' });
  logger.debug({ participantId }, 'getIntelligenceObject');

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

export async function mockGetCategoryRefs(
  participantId: string,
  categories: Category[]
): Promise<Partial<Record<Category, CategoryRef>>> {
  const logger = getLogger().child({ interface: 'mock-intelligence' });
  logger.debug({ participantId, categories }, 'getCategoryRefs');

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

export async function mockGetSession(
  participantId: string,
  sessionId: string
): Promise<Session | null> {
  const logger = getLogger().child({ interface: 'mock-sessions' });
  logger.debug({ participantId, sessionId }, 'getSession');

  const participant = mockStore.getParticipant(participantId);
  if (!participant) {
    return null;
  }

  return participant.sessions.find((s) => s.sessionId === sessionId) ?? null;
}

export async function mockGetSessions(participantId: string): Promise<Session[]> {
  const logger = getLogger().child({ interface: 'mock-sessions' });
  logger.debug({ participantId }, 'getSessions');

  const participant = mockStore.getParticipant(participantId);
  if (!participant) {
    return [];
  }

  return participant.sessions;
}

export async function mockFindValidSession(
  participantId: string,
  agentId: string,
  requiredCategories: Category[],
  requiredScopes: string[],
  currentTime: number
): Promise<Session | null> {
  const logger = getLogger().child({ interface: 'mock-sessions' });
  logger.debug(
    { participantId, agentId, requiredCategories, requiredScopes },
    'findValidSession'
  );

  const participant = mockStore.getParticipant(participantId);
  if (!participant) {
    return null;
  }

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

export async function mockValidateSession(
  participantId: string,
  sessionId: string,
  agentId: string,
  requiredCategories: Category[],
  requiredScopes: string[],
  currentTime: number
): Promise<SessionValidationResult> {
  const logger = getLogger().child({ interface: 'mock-sessions' });
  logger.debug(
    { participantId, sessionId, agentId, requiredCategories, requiredScopes },
    'validateSession'
  );

  const session = await mockGetSession(participantId, sessionId);

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

export async function mockPrepareContractWrite(
  action: WriteAction,
  params: Record<string, unknown>,
  participantId: string,
  keyId: number = 0
): Promise<PreparedWrite> {
  const logger = getLogger().child({ interface: 'mock-writes' });
  const config = getConfig();

  logger.debug({ action, participantId, keyId }, 'prepareContractWrite');

  const mapping = ACTION_METHOD_MAP[action];
  const now = getCurrentTimestamp();
  const mockTxHash = generateTxHash();

  // Build a minimal mock InteractionObject — the client signs this
  const mockIxObject: InteractionObject = {
    sender: {
      id: participantId as `0x${string}`,
      sequence: 0,
      key_id: 0,
    },
    fuel_price: 1,
    fuel_limit: 10000,
    ix_operations: [
      {
        type: OpType.LOGIC_INVOKE,
        payload: {
          logic_id: '0x2000000000000000000000000000000000000000000000000000000000000000',
          callsite: mapping.method,
        } as any,
      },
    ],
    participants: [],
  };

  return {
    method: mapping.method,
    ixObject: mockIxObject,
    expiresAt: now + config.writeRequest.ttlSeconds,
  };
}

export async function mockSubmitSignedWrite(
  signedIx: InteractionRequest
): Promise<SubmitWriteResult> {
  const logger = getLogger().child({ interface: 'mock-writes' });
  logger.debug('mockSubmitSignedWrite');

  const txHash = generateTxHash();
  const now = getCurrentTimestamp();

  mockStore.addTransaction({
    txHash,
    status: 'pending',
    submittedAt: now,
  });

  setTimeout(() => {
    mockStore.updateTransactionStatus(txHash, 'confirmed');
  }, 100);

  return { success: true, txHash };
}

export async function mockGetTransactionStatus(txHash: string): Promise<TransactionStatus> {
  const logger = getLogger().child({ interface: 'mock-writes' });
  logger.debug({ txHash }, 'getTransactionStatus');

  const tx = mockStore.getTransaction(txHash);
  if (!tx) {
    return 'pending';
  }

  return tx.status;
}

// Export mock store for testing
export { mockStore, MockStore };
