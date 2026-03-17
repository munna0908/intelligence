/**
 * Mock MOI Interface
 *
 * Provides mock implementations for local development without a real MOI network.
 */

import type {
  IntelligenceObjectSummary,
  CategoryRef,
  Session,
  WritePayload,
  TransactionStatus,
} from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import type { Category, WriteAction, ValidationFailureReason, SessionStatus } from '../../domain/types.js';
import {
  generateSessionId,
  generateNonce,
  generateTxHash,
  computeSigningDigest,
  getCurrentTimestamp,
  isSubset,
} from '../../utils/crypto.utils.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';
import type { PreparedWrite, SubmitWriteResult, SessionValidationResult } from './index.js';

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

  reset(): void {
    this.participants.clear();
    this.transactions.clear();
    this.pendingWrites.clear();
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

  // Note: The wallet builds ixArgs from this payload data
  // The server does NOT build ixArgs
  const preparedWrite: PreparedWrite = {
    contract: mapping.contract,
    method: mapping.method,
    args: params,
    payload,
    signingDigest,
    expiresAt,
    sender: {
      id: participantId,
      keyId,
      sequence: 0,
    },
  };

  mockStore.addPendingWrite(nonce, preparedWrite);

  return preparedWrite;
}

export async function mockSubmitSignedWrite(
  payload: WritePayload,
  signature: string
): Promise<SubmitWriteResult> {
  const logger = getLogger().child({ interface: 'mock-writes' });

  logger.debug(
    { contract: payload.contract, method: payload.method, nonce: payload.nonce },
    'submitSignedWrite'
  );

  const pendingWrite = mockStore.getPendingWrite(payload.nonce);
  if (!pendingWrite) {
    return { success: false, error: 'Invalid or expired write request' };
  }

  const now = getCurrentTimestamp();
  if (now > pendingWrite.expiresAt) {
    mockStore.removePendingWrite(payload.nonce);
    return { success: false, error: 'Write request has expired' };
  }

  if (!signature || signature.length < 10) {
    return { success: false, error: 'Invalid signature' };
  }

  const txHash = generateTxHash();

  mockStore.addTransaction({
    txHash,
    status: 'pending',
    submittedAt: now,
  });

  applyStateChange(payload);

  setTimeout(() => {
    mockStore.updateTransactionStatus(txHash, 'confirmed');
  }, 100);

  mockStore.removePendingWrite(payload.nonce);

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

function applyStateChange(payload: WritePayload): void {
  const participant = mockStore.getParticipant(payload.participantId);
  const now = getCurrentTimestamp();

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

// Export mock store for testing
export { mockStore, MockStore };
